const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Access token required' });

  try {
    const secret = process.env.JWT_SECRET || 'nexus-shared-jwt-secret';
    const payload = jwt.verify(token, secret);
    req.user = {
      id: payload.id || payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role || 'talent',
      skills: payload.skills || [],
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah expired' });
  }
}

function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
