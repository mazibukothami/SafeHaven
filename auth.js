const jwt = require("jsonwebtoken");
function signToken(userId){
    return jwt.sign({sub: userId}, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "7d",
    });
}
function requireAuth(req, res, next){
    const header = req.headers.authorization || " ";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if(!token) return res.status(401).json({error: "Login Required"});
    try{
        req.userId = jwt.verify(token, process.env.JWT_SECRET, {algorithms: ["HS256"]}).sub;
        next();
    } catch{
        res.status(401).json({error: "Session Expired. Please log in again."});
    }
}
module.exports = { signToken, requireAuth };
