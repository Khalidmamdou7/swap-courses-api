const {getDriver} = require('../neo4j');
const ValidationError = require('../errors/validation.error');
const NotFoundError = require('../errors/not-found.error');
const {validateCourseCode, validateProgramCode, validateYear, validateSemesterSeason} = require('../utils/validation');

const addCourseMap = async (user, courseMapName, programCode) => {
    programCode = validateProgramCode(programCode);

    driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (p:Program {code: $programCode})
                MATCH (u:User {userId: $userId})
                CREATE (u)-[:CREATED]->(cm:CourseMap {
                    name: $courseMapName,
                    id: randomUUID()
                })-[:BELONGS_TO]->(p)
                WITH u, cm, p
                MATCH (p)-[:REQUIRES]-(c:Course)
                CREATE (cm)-[:CONTAINS {taken: false, outdegree: size((c)-[:PREREQUISITE]->()) , lastPrereqSemesterOrder: -1}]->(c)
                RETURN u, cm, p`,
                {userId: user.userId, programCode, courseMapName}
            )
        );
        if (res.records.length === 0) {
            throw new NotFoundError('Program not found');
        }
        const program = res.records[0].get('p').properties;
        const courseMap = res.records[0].get('cm').properties;
        courseMap.program = program;
        return courseMap;
    } catch (error) {
        if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
            throw new ValidationError('Course map already exists');
        }
        throw error;
    } finally {
        await session.close();
    }
}

const getCourseMaps = async (user) => {
    driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap)
                RETURN cm`,
                {userId: user.userId}
            )
        );
        const courseMaps = res.records.map(record => record.get('cm').properties);
        return courseMaps;
    } finally {
        await session.close();
    }
}

const addSemesterToCourseMap = async (user, courseMapId, semesterSeason, semesterYear) => {
    semesterSeason = validateSemesterSeason(semesterSeason);
    semesterYear = validateYear(semesterYear);
    
    driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap {id: $courseMapId})
                CREATE (cm)-[:HAS_SEMESTER]->(s:Semester {
                    season: $semesterSeason,
                    year: $semesterYear,
                    order: size((cm)-[:HAS_SEMESTER]->()), 
                    id: randomUUID()
                })
                RETURN cm, s`,
                {userId: user.userId, courseMapId, semesterSeason, semesterYear}
            )
        );
        if (res.records.length === 0) {
            throw new NotFoundError('Course map not found');
        }
        const semester = res.records[0].get('s').properties;
        return semester;
    }
    finally {
        await session.close();
    }
}

const getSemesters = async (user, courseMapId) => {
    driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester)
                RETURN s
                ORDER BY s.order`,
                {userId: user.userId, courseMapId}
            )
        );
        const semesters = res.records.map(record => record.get('s').properties);
        return semesters;
    } finally {
        await session.close();
    }
}

const addCourseToSemester = async (user, courseMapId, semesterId, courseCode) => {
    courseCode = validateCourseCode(courseCode);

    driver = getDriver();
    const session = driver.session();
    try {
        // check if course exists in course map
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap {id: $courseMapId})-[:CONTAINS]->(c:Course {code: $courseCode})
                RETURN c`,
                {userId: user.userId, courseMapId, courseCode}
            )
        );
        if (res.records.length === 0) {
            throw new ValidationError('Course does not exist in course map');
        }

        // check if the course is already taken or one of its prerequisites is not taken
        const res2 = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap {id: $courseMapId})-[:CONTAINS]->(c:Course {code: $courseCode})
                Match (cm)-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})
                MATCH (cm)-[cont:CONTAINS {taken: false , outdegree: 0}]->(c:Course {code: $courseCode})
                WHERE cont.lastPrereqSemesterOrder < s.order
                RETURN c`,
                {userId: user.userId, courseMapId, semesterId, courseCode}
            )
        );
        if (res2.records.length === 0) {
            throw new ValidationError('Course is already taken or one of its prerequisites is not taken yet');
        }

        // check if the prerequisite credit hours of the past semesters is equal to or greater than the course's prerequisite credit hours
        const res3 = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})
                MATCH (cm)-[:HAS_SEMESTER]->(s2:Semester)
                WHERE s2.order < s.order
                MATCH (s2)-[:TAKES]->(c:Course)
                WITH sum(c.creditHours) AS creditHours
                MATCH (cm)-[:CONTAINS]->(c:Course {code: $courseCode})
                WHERE creditHours >= c.prerequisiteHours
                RETURN c`,
                {userId: user.userId, courseMapId, semesterId, courseCode}
            )
        );
        if (res3.records.length === 0) {
            throw new ValidationError('Prerequisite credit hours of the past semesters is less than the course\'s prerequisite credit hours');
        }

        // add course to semester and update the course's prerequisites outdegree
        const res4 = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (cm:CourseMap {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})
                MATCH (cm)-[cont:CONTAINS]->(c:Course {code: $courseCode})
                
                OPTIONAL MATCH (s)-[:TAKES]->(courses:Course)

                OPTIONAL MATCH (c2:Course)-[:PREREQUISITE]->(c)
                OPTIONAL MATCH (cm)-[cont2:CONTAINS {taken: false}]->(c2)
                SET cont2.outdegree = cont2.outdegree - 1
                SET cont2.lastPrereqSemesterOrder = CASE WHEN cont2.lastPrereqSemesterOrder < s.order THEN s.order ELSE cont2.lastPrereqSemesterOrder END


                WITH DISTINCT c, s, cm, cont, courses

                CREATE (s)-[:TAKES]->(c)
                SET cont.taken = true
                
                RETURN cm, s, c, courses`,
                {courseMapId, semesterId, courseCode}
            )
        );
        if (res4.records.length === 0) {
            throw new NotFoundError('Course could not be added to semester');
        }

        let semester = res4.records[0].get('s').properties;
        const courses = res4.records[0].get('courses') ? res4.records[0].get('courses').properties : null;
        const course = res4.records[0].get('c').properties;
        semester.courses = courses ? [course, courses] : [course];

        return semester;
    }
    finally {
        await session.close();
    }
}

const getAvailableCourses = async (user, courseMapId, semesterId) => {
    driver = getDriver();
    const session = driver.session();
    try {
        // get courses that are not taken and have no prerequisites or all prerequisites are taken
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (cm:CourseMap {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})
                MATCH (cm)-[cont:CONTAINS {taken: false, outdegree: 0}]->(c:Course)
                WHERE cont.lastPrereqSemesterOrder < s.order
                RETURN c`,
                {userId: user.userId, courseMapId, semesterId}
            )
        );
        const coursesCodes = res.records.map(record => record.get('c').properties.code);
        
        // check if the prerequisite credit hours of the past semesters is equal to or greater than the course's prerequisite credit hours
        const res2 = await session.readTransaction(tx =>
            tx.run(
                `MATCH (cm:CourseMap {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})
                OPTIONAL MATCH (cm)-[:HAS_SEMESTER]->(s2:Semester)
                WHERE s2.order < s.order
                OPTIONAL MATCH (s2)-[:TAKES]->(c:Course)
                WITH sum(c.creditHours) AS creditHours, cm, s
                
                MATCH (c:Course) WHERE c.code IN $coursesCodes AND c.prerequisiteHours <= creditHours
                RETURN c`,
                {userId: user.userId, courseMapId, semesterId, coursesCodes}
            )
        );
        const availableCourses = res2.records.map(record => record.get('c').properties);

        return availableCourses;
    } finally {
        await session.close();
    }
}

const getCoursesBySemester = async (user, courseMapId, semesterId) => {
    driver = getDriver();
    const session = driver.session();
    try {
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})-[:TAKES]->(c:Course)
                RETURN c`,
                {userId: user.userId, courseMapId, semesterId}
            )
        );
        const courses = res.records.map(record => record.get('c').properties);
        return courses;
    } finally {
        await session.close();
    }
}

const removeCourseFromSemester = async (user, courseMapId, semesterId, courseCode) => {
    courseCode = validateCourseCode(courseCode);


    driver = getDriver();
    const session = driver.session();
    try {
        // check if course is in semester
        // check if there are any courses that depend on this course that are taken, if so, don't allow removal of course
        // after removing course, check if any courses that depend on this course and update outdegree
        const res = await session.readTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap 
                    {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})-[t:TAKES]->(c:Course {code: $courseCode})
                OPTIONAL MATCH (cm)-[cont:CONTAINS {taken: true}]->(c2:Course)-[:PREREQUISITE]->(c)

                RETURN cm, s, c, cont, collect(c2) as prereqs`,
                {userId: user.userId, courseMapId, semesterId, courseCode}
            )
        );
        if (res.records.length === 0) {
            throw new NotFoundError('Course not found in semester');
        }
        
        const prereqs = res.records[0].get('prereqs');
        if (prereqs.length > 0) {
            throw new ValidationError('Cannot remove course because it is a prerequisite for other taken courses, remove those courses first and try again\n'
            + prereqs.map(c => c.properties.code).join(', '));
        }
        
        const c = res.records[0].get('c').properties;
        const res2 = await session.writeTransaction(tx =>
            tx.run(
                `MATCH (u:User {userId: $userId})-[:CREATED]->(cm:CourseMap
                    {id: $courseMapId})-[:HAS_SEMESTER]->(s:Semester {id: $semesterId})-[t:TAKES]->(c:Course {code: $courseCode})
                MATCH (cm)-[cont:CONTAINS]->(c)
                
                DELETE t
                SET cont.taken = false
                
                WITH cm, s, c
                OPTIONAL MATCH (cm)-[cont2:CONTAINS {taken: false}]->(c2:Course)-[:PREREQUISITE]->(c)
                SET cont2.outdegree = cont2.outdegree + 1

                RETURN cm, s, c`,
                {userId: user.userId, courseMapId, semesterId, courseCode}
            )
        );
        const courseMap = res.records[0].get('cm').properties;
        const semester = res.records[0].get('s').properties;
        return {courseMap, semester};
    }
    finally {
        await session.close();
    }
}

module.exports = {
    addCourseMap,
    getCourseMaps,
    addSemesterToCourseMap,
    getSemesters,
    addCourseToSemester,
    getAvailableCourses,
    getCoursesBySemester,
    removeCourseFromSemester
};