const jwt = require('jsonwebtoken');
const { hash, compare } = require('bcrypt');
const { getDriver } = require('../neo4j');


const register = async (email, plainPassword, name) => {
    const encrypted = await hash(plainPassword, parseInt(process.env.SALT_ROUNDS));

    driver = getDriver();
    const session = driver.session();

    try {
        const res = await session.writeTransaction(tx =>
            tx.run(
                `CREATE (u:User {
                    userId: randomUuid(),
                    email: $email,
                    password: $encrypted,
                    name: $name
                })
                RETURN u`,
                { email, encrypted, name }
            )
        );
        
        const user = res.records[0].get('u').properties;
        const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET);
        return { user, token };

    } catch (error) {
        if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
            throw new ValidationError('Email already exists');
        }
        throw error;
    } finally {
        await session.close();
    }
}

module.exports = {
    register
}