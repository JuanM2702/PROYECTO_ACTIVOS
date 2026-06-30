const express = require('express');
const router = Router = express.Router();
const movementController = require('../controllers/movementController');
const { authenticateToken, requireRole } = require('../config/auth');

// Consultar todo el histórico de traslados (Disponible para todos los usuarios autenticados)
router.get('/', authenticateToken, movementController.getMovements);

// Registrar un nuevo traslado físico/administrativo (Solo ADMIN y OPERATOR)
router.post('/', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), movementController.createMovement);

module.exports = router;
