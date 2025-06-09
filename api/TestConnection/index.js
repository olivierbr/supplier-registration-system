module.exports = async function (context, req) {
    context.log('TestConnection function called');
    
    context.res = {
        status: 200,
        body: {
            success: true,
            message: "API is working!",
            method: req.method,
            timestamp: new Date().toISOString(),
            environment: {
                nodeVersion: process.version,
                hasSQL_USER: !!process.env.SQL_USER,
                hasSQL_PASSWORD: !!process.env.SQL_PASSWORD,
                hasSQL_SERVER: !!process.env.SQL_SERVER,
                hasSQL_DATABASE: !!process.env.SQL_DATABASE
            }
        }
    };
};