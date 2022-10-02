const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

// nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});

// send email
const sendEmail = async (email, subject, text) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject,
            text
        };
        await transporter.sendMail(mailOptions);
        console.log('Email sent');
    } catch (error) {
        console.log("Error sending email: ", error);
    }
    
};

// send confirmation email with nice css styling and a button to confirm and a description of the website and a link to copy the confirmation link
// and a button to copy the confirmation link to the clipboard and a button if the user hasn't registered on the website to report this as a bug
const sendConfirmationEmail = async (email, userId, token) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Confirm your email',
            html: `
            <div style="background-color: #f2f2f2; padding: 20px; border-radius: 10px; width: 500px; margin: 0 auto;">
                <h1 style="text-align: center; color: #4d4d4d;">Confirm your email</h1>
                <p style="text-align: center; color: #4d4d4d;">Please click the button below to confirm your email.</p>
                <a href="http://${process.env.DOMAIN}/api/auth/confirm/${userId}/${token}" style="text-decoration: none; display: block; margin: 0 auto; width: 200px; background-color: #4d4d4d; color: #f2f2f2; padding: 10px; border-radius: 10px; text-align: center;">Confirm</a>
                <p style="text-align: center; color: #4d4d4d;">If you can't click on the button, please copy the following link to your browser</p>
                <p style="text-align: center; color: #4d4d4d;">http://${process.env.DOMAIN}/api/auth/confirm/${userId}/${token}</p>
                <br>
                <p style="text-align: center; color: #4d4d4d;">Thank you for using our website</p>
                <p style="text-align: center; color: #4d4d4d;">The <a href="http://${process.env.CLIENT_URL}" style="text-decoration: none; color: #4d4d4d;">Swap Courses</a> team</p>
                <hr style="border: 0.5px solid #4d4d4d; width: 100%; margin: 20px 0;">
                <p style="text-align: center; color: #4d4d4d;">If you didn't sign up for an account, you can safely delete this email</p>
            </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log('Confirmation Email sent');
    } catch (error) {
        console.log("Error sending confirmation email: ", error);
    }

};

const sendResetPasswordEmail = async (email, userId, token) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Reset your password',
            html: `
            <div style="background-color: #f2f2f2; padding: 20px; border-radius: 10px; width: 500px; margin: 0 auto;">
                <h1 style="text-align: center; color: #4d4d4d;">Reset your password</h1>
                <p style="text-align: center; color: #4d4d4d;">Please click the button below to reset your password.</p>
                <a href="http://${process.env.CLIENT_URL}/reset-password/${userId}/${token}" style="text-decoration: none; display: block; margin: 0 auto; width: 200px; background-color: #4d4d4d; color: #f2f2f2; padding: 10px; border-radius: 10px; text-align: center;">Reset password</a>
                <p style="text-align: center; color: #4d4d4d;">If you can't click on the button, please copy the following link to your browser</p>
                <p style="text-align: center; color: #4d4d4d;">http://${process.env.CLIENT_URL}/reset-password/${userId}/${token}</p>
                <br>
                <p style="text-align: center; color: #4d4d4d;">Thank you for using our website</p>
                <p style="text-align: center; color: #4d4d4d;">The <a href="http://${process.env.CLIENT_URL}" style="text-decoration: none; color: #4d4d4d;">Swap Courses</a> team</p>
                <hr style="border: 0.5px solid #4d4d4d; width: 100%; margin: 20px 0;">
                <p style="text-align: center; color: #4d4d4d;">If you didn't request to reset your password, you can safely delete this email</p>
            </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log('Reset Password email sent');
    } catch (error) {
        console.log("Error sending reset Password email: ", error);
    }
};

const sendPasswordChangedEmail = async (email) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Password changed',
            html: `
            <div style="background-color: #f2f2f2; padding: 20px; border-radius: 10px; width: 500px; margin: 0 auto;">
                <h1 style="text-align: center; color: #4d4d4d;">Password changed</h1>
                <p style="text-align: center; color: #4d4d4d;">Your password has been changed successfully.</p>
                <p style="text-align: center; color: #4d4d4d;">If you didn't change your password, please contact us immediately at <a href="mailto:${process.env.EMAIL}" style="text-decoration: none; color: #4d4d4d;">${process.env.EMAIL}</a></p>
                <br>
                <p style="text-align: center; color: #4d4d4d;">Thank you for using our website</p>
                <p style="text-align: center; color: #4d4d4d;">The <a href="http://${process.env.CLIENT_URL}" style="text-decoration: none; color: #4d4d4d;">Swap Courses</a> team</p>
            </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log('Password changed email sent');
    } catch (error) {
        console.log("Error sending password changed email: ", error);
    }
};

// send a notification email to the user that a match has been found for his swap request
const sendMatchFoundEmail = async (email) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Match found',
            html: `
            <div style="background-color: #f2f2f2; padding: 20px; border-radius: 10px; width: 500px; margin: 0 auto;">
                <h1 style="text-align: center; color: #4d4d4d;">Match found</h1>
                <p style="text-align: center; color: #4d4d4d;">A match has been found for your swap request</p>
                <p style="text-align: center; color: #4d4d4d;">You can view the match on your <a href="http://${process.env.CLIENT_URL}/swapstatus" style="text-decoration: none; color: #4d4d4d;">dashboard</a></p>
                <br>
                <p style="text-align: center; color: #4d4d4d;">Thank you for using our website</p>
                <p style="text-align: center; color: #4d4d4d;">The <a href="http://${process.env.CLIENT_URL}" style="text-decoration: none; color: #4d4d4d;">Swap Courses</a> team</p>  
            </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log('Match Found email sent');
    } catch (error) {
        console.log("Error sending match found email: ", error);
    }
};


module.exports = {
    sendEmail,
    sendConfirmationEmail,
    sendMatchFoundEmail,
    sendResetPasswordEmail,
    sendPasswordChangedEmail
};