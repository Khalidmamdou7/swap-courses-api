const NotFoundError = require('../errors/not-found.error');
const ValidationError = require('../errors/validation.error');
const { getDriver } = require('../neo4j');


const createSwapRequest = async (user, timeslot) => {
    const wantedTimeslots = timeslot.wantedTimeslots || [];
    const offeredTimeslot = timeslot.offeredTimeslot || "";
    const driver = getDriver();
    const session = driver.session();
    try {
        // validate that the user is not trying to swap a timeslot with itself
        if (wantedTimeslots.includes(offeredTimeslot)) {
            console.log('offeredTimeslot', offeredTimeslot);
            console.log('wantedTimeslots', wantedTimeslots);
            throw new ValidationError('Cannot swap a timeslot with itself');
        }
        
        const res2 = await session.readTransaction(tx =>
            tx.run(
                `MATCH (t:Timeslot)
                WHERE t.id IN $wantedTimeslotIds
                RETURN t`,
                { wantedTimeslotIds: wantedTimeslots }
        ));
        if (res2.records.length !== wantedTimeslots.length) {
            console.log('wantedTimeslots', wantedTimeslots);
            throw new NotFoundError('One or more wanted timeslots not found');
        }
        // create the swap request
        const res3 = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})
                MATCH (ot:Timeslot)
                WHERE ot.id = $offeredTimeslotId
                CREATE (sr:SwapRequest 
                    {id: randomUUID(), status: 'pending', createdAt: datetime(), updatedAt: datetime()})
                CREATE (u)-[:REQUESTED]->(sr)
                CREATE (sr)-[:OFFERS]->(ot)
                WITH sr, ot
                MATCH (wt:Timeslot)
                WHERE wt.id IN $wantedTimeslotIds
                CREATE (sr)-[:WANTS]->(wt)
                RETURN sr, ot, wt`,
                { userId: user.userId, offeredTimeslotId: offeredTimeslot , wantedTimeslotIds: wantedTimeslots }
        ));
        if (res3.records.length === 0) {
            console.log('offeredTimeslot', offeredTimeslot);
            throw new NotFoundError('Offered timeslot not found');
        }
        const sr = res3.records[0].get('sr').properties;
        const ot = res3.records[0].get('ot').properties;
        const wt = res3.records[0].get('wt').properties;
        // check if the swap request matches any other swap requests
        const matches = await checkSwapRequestMatches(user, sr.id);
        return {
            ...sr,
            offeredTimeslot: ot,
            wantedTimeslots: [wt],
            matches
        };
    }
    finally {
        await session.close();
    }
}

const checkSwapRequestMatches = async (user, swapRequestId) => {
    const driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:REQUESTED]->(sr:SwapRequest {swapRequestId: $swapRequestId})
                MATCH (sr)-[:OFFERS]->(ot:Timeslot)
                MATCH (sr)-[:WANTS]->(wt:Timeslot)
                MATCH (sr2:SwapRequest)-[:OFFERS]->(wt)
                MATCH (sr2)-[:WANTS]->(ot)
                MATCH (sr2)<-[:REQUESTED]-(u2:User)
                WHERE sr2.status = 'pending'
                AND NOT (u)-[:REQUESTED]->(sr2)
                SET sr.status = 'waiting-for-agreement'
                SET sr2.status = 'waiting-for-agreement'
                CREATE (sr)-[:MATCHES {status: 'waiting-for-agreement'}]->(sr2)
                RETURN sr, sr2, u2`,
                { userId: user.userId, swapRequestId }
            )
        );
        return res.records.map(record => {
            const sr = record.get('sr').properties;
            const sr2 = record.get('sr2').properties;
            const u2 = record.get('u2').properties;
            return {
                ...sr,
                matchedSwapRequest: sr2,
                matchedUser: u2.email
            };
        });
    }
    finally {
        await session.close();
    }
}

const getSwapRequests = async (user) => {
    const driver = getDriver();
    const session = driver.session();
    try {
        // if a swap request status is waiting-for-agreement, return the matching users too
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:REQUESTED]->(sr:SwapRequest)
                MATCH (sr)-[:OFFERS]->(ot:Timeslot)
                MATCH (sr)-[:WANTS]->(wt:Timeslot)
                OPTIONAL MATCH (sr)-[:MATCHES]->(sr2:SwapRequest)
                OPTIONAL MATCH (sr2)<-[:REQUESTED]-(u2:User)
                RETURN sr, ot, wt, sr2, u2`,
                { userId: user.userId }
        ));
        // for each swap request, get the offered and wanted timeslots. if there are duplicates swap requests,
        // then the offered and wanted timeslots will be duplicated as well. so we need to group them by swap request id
        const swapRequests = {};
        res.records.forEach(record => {
            const sr = record.get('sr').properties;
            const ot = record.get('ot').properties;
            const wt = record.get('wt').properties;
            const sr2 = record.get('sr2') ? record.get('sr2').properties : null;
            const u2 = record.get('u2') ? record.get('u2').properties : null;
            if (!swapRequests[sr.id]) {
                swapRequests[sr.id] = {
                    ...sr,
                    offeredTimeslot: ot,
                    wantedTimeslots: [wt],
                    matchedSwapRequest: sr2,
                    matchedUser: u2 ? u2.email : null
                };
            }
            else {
                swapRequests[sr.id].wantedTimeslots.push(wt);
            }
        });
        return Object.values(swapRequests);
    }
    finally {
        await session.close();
    }
}

const updateSwapRequest = async (user, timeslotId, timeslot) => {
    const wantedTimeslots = timeslot.wantedTimeslots || [];
    const offeredTimeslot = timeslot.offeredTimeslot || "";
    const driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:REQUESTED]->(sr:SwapRequest {swapRequestId: $swapRequestId})
                MATCH (wantedTimeslots:Timeslot) WHERE wantedTimeslots.id IN $wantedTimeslots
                MATCH (offeredTimeslot:Timeslot) WHERE offeredTimeslot.id = $offeredTimeslot
                SET sr.updatedAt = datetime()
                DELETE sr-[w:WANTS]->()
                DELETE sr-[o:OFFERS]->()
                CREATE (sr)-[w:WANTS]->(wantedTimeslots)
                CREATE (sr)-[o:OFFERS]->(offeredTimeslot)
                RETURN sr, w, o`,
                { userId: user.userId, swapRequestId: timeslotId, wantedTimeslots, offeredTimeslot }
            )
        );
        const sr = res.records[0].get('sr').properties;
        const w = res.records[0].get('w').properties;
        const o = res.records[0].get('o').properties;
        // check if the swap request matches any other swap requests
        const matches = await checkSwapRequestMatches(user, sr.id);
        return {
            ...sr,
            offeredTimeslot: o,
            wantedTimeslots: [w],
            matches
        };
    }
    finally {
        await session.close();
    }
}

const agreeSwapRequest = async (user, swapRequestId, matchedSwapRequestId) => {
    const driver = getDriver();
    const session = driver.session();
    try {
        // Regarding the matched swap request SET the matches relationship status to 'agreed' only if both swap requests are in 'agreed' status
        // if there is a multiple matched swap requests, then the other matched swap requests will be deleted and set to 'pending'.
        const res = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:REQUESTED]->(sr:SwapRequest {swapRequestId: $swapRequestId})
                MATCH (sr)-[m1:MATCHES]-(sr2:SwapRequest {swapRequestId: $matchedSwapRequestId})
                MATCH (sr)-[:OFFERS]->(ot:Timeslot)
                MATCH (sr)-[:WANTS]->(wt:Timeslot)
                MATCH (sr2)-[:OFFERS]->(ot2:Timeslot)
                MATCH (sr2)-[:WANTS]->(wt2:Timeslot)
                SET sr.status = 'agreed'
                SET m1.status = CASE WHEN sr2.status = 'agreed' THEN 'agreed' ELSE m1.status END
                MATCH (sr)-[m2:MATCHES]->(sr3:SwapRequest)
                WHERE sr3 <> sr2
                DELETE m2
                MATCH (sr3)-[m3:MATCHES]->(sr4:SwapRequest)
                WHERE sr4 <> sr
                SET sr4.status = CASE WHEN m3.status IS NULL THEN 'pending' ELSE sr3.status END
                RETURN sr, ot, wt, sr2, ot2, wt2, m1`,
                { userId: user.userId, swapRequestId, matchedSwapRequestId }
            )
        );
        const sr = res.records[0].get('sr').properties;
        const ot = res.records[0].get('ot').properties;
        const wt = res.records[0].get('wt').properties;
        const sr2 = res.records[0].get('sr2').properties;
        const ot2 = res.records[0].get('ot2').properties;
        const wt2 = res.records[0].get('wt2').properties;
        const m1 = res.records[0].get('m1').properties;
        return {
            ...sr,
            offeredTimeslot: ot,
            wantedTimeslots: [wt],
            matchedSwapRequest: {
                ...sr2,
                offeredTimeslot: ot2,
                wantedTimeslots: [wt2],
                matches: m1
            }
        };
    }
    finally {
        await session.close();
    }
}

const deleteSwapRequest = async (user, swapRequestId) => {
    const driver = getDriver();
    const session = driver.session();
    try {
        // if a swap request status is waiting-for-agreement, set the status of the matching swap request to pending
        const res = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:REQUESTED]->(sr:SwapRequest {swapRequestId: $swapRequestId})
                MATCH (sr)-[m:MATCHES]->(sr2:SwapRequest)
                OPTIONAL MATCH (sr2)-[m2:MATCHES]->(sr3:SwapRequest)
                SET sr2.status = CASE WHEN m2 IS NULL THEN 'pending' ELSE sr2.status END
                DETACH DELETE sr`,
                { userId: user.userId, swapRequestId }
            )
        );
        return res.records.length > 0;
    }
    finally {
        await session.close();
    }
}


module.exports = {
    getSwapRequests,
    createSwapRequest,
    updateSwapRequest,
    deleteSwapRequest,
    agreeSwapRequest
};