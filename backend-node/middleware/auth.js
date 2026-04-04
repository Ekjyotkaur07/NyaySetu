const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

const legalAccessMiddleware = (req, res, next) => {
  if (req.user.role !== 'legal_official' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Legal officials only.' });
  }
  next();
};

module.exports = { authMiddleware, legalAccessMiddleware };