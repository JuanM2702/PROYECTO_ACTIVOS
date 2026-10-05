const express = require('express');
const router = express.Router();
const acceptanceController = require('../controllers/acceptanceController');
const { authenticateToken } = require('../config/auth');

// Obtener actas de aceptación asociadas al usuario (o globales si es ADMIN/OPERATOR)
router.get('/', authenticateToken, acceptanceController.getAcceptances);

// Firmar acta de aceptación masiva (Mismo usuario entregante)
router.put('/bulk-respond', authenticateToken, acceptanceController.bulkRespondToAcceptance);

// Firmar acta de aceptación individual (Aprobar/Rechazar equipo asignado)
router.put('/:id', authenticateToken, acceptanceController.respondToAcceptance);

// Descargar PDF firmado almacenado en MinIO (solo si está ACEPTADO)
router.get('/:id/pdf', authenticateToken, acceptanceController.downloadAcceptancePDF);

// Obtener conteo y resumen de aceptaciones pendientes para la campanita
router.get('/notifications', authenticateToken, acceptanceController.getPendingCount);

// Marcar notificación como leída
router.post('/notifications/:id/read', authenticateToken, acceptanceController.markNotificationAsRead);

module.exports = router;

