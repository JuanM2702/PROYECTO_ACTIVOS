const express = require('express');
const router = express.Router();
const acceptanceController = require('../controllers/acceptanceController');
const { authenticateToken } = require('../config/auth');

// Obtener actas de aceptación asociadas al usuario (o globales si es ADMIN/OPERATOR)
router.get('/', authenticateToken, acceptanceController.getAcceptances);

// Firmar acta de aceptación (Aprobar/Rechazar equipo asignado)
router.put('/:id', authenticateToken, acceptanceController.respondToAcceptance);

module.exports = router;
