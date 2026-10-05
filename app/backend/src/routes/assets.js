const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticateToken, requireRole } = require('../config/auth');

// Listar y buscar activos (Disponible para todos los usuarios autenticados)
router.get('/', authenticateToken, assetController.getAssets);

// Exportar activos a Excel
router.get('/export', authenticateToken, assetController.exportAssets);

// Actualización masiva de activos (Solo ADMIN y OPERATOR)
router.patch('/bulk-update', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), assetController.bulkUpdateAssets);

// Eliminar masivamente activos (Solo ADMIN)
router.post('/bulk-delete', authenticateToken, requireRole(['ADMIN']), assetController.bulkDeleteAssets);

// Subida de fotografías a MinIO (Solo ADMIN y OPERATOR)
router.post('/upload-photo', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), assetController.uploadPhoto);

// Servir foto desde MinIO
router.get('/photos/:filename', assetController.servePhoto);

// Subida de documentos (facturas, orden de compra) a MinIO (Solo ADMIN y OPERATOR)
router.post('/upload-document', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), assetController.uploadDocument);

// Servir documento desde MinIO
router.get('/documents/:filename', assetController.serveDocument);

// Descargar plantilla Excel para carga masiva
router.get('/template', authenticateToken, assetController.downloadTemplate);

// Carga y creación masiva de activos desde Excel (Solo ADMIN)
router.post('/bulk-create', authenticateToken, requireRole(['ADMIN']), assetController.bulkCreateAssets);

// Detalle de un activo específico
router.get('/:id', authenticateToken, assetController.getAssetById);

// Registrar un activo nuevo (Solo ADMIN)
router.post('/', authenticateToken, requireRole(['ADMIN']), assetController.createAsset);

// Modificar un activo (Solo ADMIN y OPERATOR)
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'OPERATOR']), assetController.updateAsset);

// Eliminar permanentemente un activo (Restringido estrictamente a ADMIN)
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), assetController.deleteAsset);

module.exports = router;
