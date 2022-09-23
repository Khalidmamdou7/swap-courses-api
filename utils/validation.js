const ValidationError = require('../errors/validation.error');

const validateCourseCode = (code) => {
    code = code.toUpperCase();
    const regex = /^[A-Z]{2,4}N[0-9]{3}$/;
    if (!regex.test(code)) {
        throw new ValidationError('Invalid course code, must be in the format of CMPN123 or PEN123');
    }
}

const validateSemester = (semester) => {
    if (typeof semester !== 'string')
        throw new ValidationError('Semester must be a string');

    semester = semester.toUpperCase();
    if (!semester.match(/^[FSU]{1,2}\d{2}$/))
        throw new ValidationError('Invalid semester format, must be in the format of F22 or S23 or SU23');
}

const validateTimeslotType = (type) => {
    if (typeof type !== 'string')
        throw new ValidationError('Timeslot type must be a string');
    if (!type.match(/^(lec(ture)?s|tut(orial)?s)$/))
        throw new ValidationError('Invalid timeslot type, must be either lectures or tutorials or lecs or tuts');
}

const validateGroup = (group) => {
    group = Number(group);
    if (isNaN(group))
        throw new ValidationError('Group must be a number');
    if (group < 1 || group > 10)
        throw new ValidationError('Invalid group, must be between 1 and 10');
}


const validateDay = (day) => {
    if (typeof day !== 'string')
        throw new ValidationError('Day must be a string');
    
    day = day[0].toUpperCase() + day.slice(1);
    if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday'].includes(day))
        throw new ValidationError('Invalid day, must be one of the following: Monday, Tuesday, Wednesday, Thursday, Saturday, Sunday');
}

const validateTime = (time) => {
    if (typeof time !== 'string')
        throw new ValidationError('Time must be a string');
    if (!time.match(/^[0-9]{1,2}:[0-9]{2}$/))
        throw new ValidationError('Invalid time format, must be in the format of 12:00 or 9:00, input: ' + time);
}


module.exports = {
    validateCourseCode,
    validateSemester,
    validateTimeslotType,
    validateGroup,
    validateDay,
    validateTime
}