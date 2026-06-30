const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticateToken, requireRole } = require('../config/auth');

// Listar y buscar activos (Disponible para todos los usuarios autenticados)
router.get('/', authenticateToken, assetController.getAssets);

// Detalle de un activo específico
router.get('/:id', authenticateToken, assetController.getAssetById);

// Registrar un activo nuevo (Solo ADMIN y OPERATOR)
router.post('/', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), assetController.createAsset);

// Modificar un activo (Solo ADMIN y OPERATOR)
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), assetController.updateAsset);

// Eliminar permanentemente un activo (Restringido estrictamente a ADMIN)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), assetController.deleteAsset);

module.exports = router;
