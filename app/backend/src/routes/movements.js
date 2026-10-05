const express = require('express');
const router = express.Router();
const movementController = require('../controllers/movementController');
const { authenticateToken } = require('../config/auth');

// Consultar historial de traslados (todos los usuarios autenticados, con RLS en el controller)
router.get('/', authenticateToken, movementController.getMovements);

// Registrar un traslado (todos los usuarios autenticados pueden crear movimientos de sus activos)
router.post('/', authenticateToken, movementController.createMovement);

// Previsualizar el acta de traslado usando la plantilla PDF oficial en MinIO
router.post('/preview', authenticateToken, movementController.previewPDF);

module.exports = router;
