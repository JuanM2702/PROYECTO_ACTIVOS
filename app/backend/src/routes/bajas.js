const express = require('express');
const router = express.Router();
const bajaController = require('../controllers/bajaController');
const { authenticateToken, requireRole } = require('../config/auth');

// Listar todas las bajas (Solo ADMIN)
router.get('/', authenticateToken, requireRole(['ADMIN']), bajaController.getBajas);

// Registrar una nueva baja (Individual o Masiva - Solo ADMIN)
router.post('/', authenticateToken, requireRole(['ADMIN']), bajaController.createBaja);

// Marcar notificación de baja como leída/resuelta (Cualquier usuario autenticado)
router.post('/notifications/:id/read', authenticateToken, bajaController.markNotificationAsRead);

// Detalle de una baja específica (Solo ADMIN)
router.get('/:id', authenticateToken, requireRole(['ADMIN']), bajaController.getBajaById);

module.exports = router;
