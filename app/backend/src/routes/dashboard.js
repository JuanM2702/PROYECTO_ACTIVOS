const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../config/auth');

// Obtener métricas consolidadas y KPIs para gráficos
router.get('/stats', authenticateToken, dashboardController.getDashboardStats);

// Obtener todos los eventos (movimientos + bajas + aceptaciones) con paginación
router.get('/all-events', authenticateToken, dashboardController.getAllEvents);

module.exports = router;

