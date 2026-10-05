const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireRole } = require('../config/auth');

// Endpoint de Inicio de Sesión
router.post('/login', authController.login);

// Endpoint de Cierre de Sesión
router.post('/logout', authController.logout);

// Obtener detalles del perfil activo (Verificación de Sesión)
router.get('/me', authenticateToken, authController.me);

// Obtener todos los usuarios del sistema (Para combos básicos, filtrado por activos)
router.get('/users', authenticateToken, authController.getUsers);

// ==========================================
// Rutas de Administración de Usuarios
// ==========================================
router.get('/admin/users', authenticateToken, requireRole(['ADMIN']), authController.getAllUsersAdmin);
router.get('/admin/central-user/:cedula', authenticateToken, requireRole(['ADMIN']), authController.getCentralUser);
router.post('/admin/users', authenticateToken, requireRole(['ADMIN']), authController.createUser);
router.put('/admin/users/:id', authenticateToken, requireRole(['ADMIN']), authController.updateUser);
router.put('/admin/users/:id/status', authenticateToken, requireRole(['ADMIN']), authController.updateUserStatus);
router.put('/admin/users/:id/modules', authenticateToken, requireRole(['ADMIN']), authController.updateUserModules);

module.exports = router;
