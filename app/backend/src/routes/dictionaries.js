const express = require('express');
const router = express.Router();
const dictController = require('../controllers/dictionaryController');
const { authenticateToken, requireRole } = require('../config/auth');

// Helper to define CRUD routes
const defineCrud = (path, getFn, createFn, updateFn, deleteFn) => {
  router.get(`/${path}`, authenticateToken, getFn);
  router.post(`/${path}`, authenticateToken, requireRole(['ADMIN']), createFn);
  router.put(`/${path}/:id`, authenticateToken, requireRole(['ADMIN']), updateFn);
  router.delete(`/${path}/:id`, authenticateToken, requireRole(['ADMIN']), deleteFn);
};

defineCrud('brands', dictController.getBrands, dictController.createBrand, dictController.updateBrand, dictController.deleteBrand);
defineCrud('resource-types', dictController.getResourceTypes, dictController.createResourceType, dictController.updateResourceType, dictController.deleteResourceType);
defineCrud('states', dictController.getStates, dictController.createState, dictController.updateState, dictController.deleteState);
defineCrud('cargos', dictController.getCargos, dictController.createCargo, dictController.updateCargo, dictController.deleteCargo);
defineCrud('companies', dictController.getCompanies, dictController.createCompany, dictController.updateCompany, dictController.deleteCompany);
defineCrud('oficinas', dictController.getOficinas, dictController.createOficina, dictController.updateOficina, dictController.deleteOficina);
defineCrud('puntos', dictController.getPuntos, dictController.createPunto, dictController.updatePunto, dictController.deletePunto);
defineCrud('areas', dictController.getAreas, dictController.createArea, dictController.updateArea, dictController.deleteArea);
defineCrud('ubicaciones', dictController.getUbicaciones, dictController.createUbicacion, dictController.updateUbicacion, dictController.deleteUbicacion);
defineCrud('subresource-types', dictController.getSubresourceTypes, dictController.createSubresourceType, dictController.updateSubresourceType, dictController.deleteSubresourceType);
defineCrud('proveedores', dictController.getProveedores, dictController.createProveedor, dictController.updateProveedor, dictController.deleteProveedor);
defineCrud('motivos-baja', dictController.getMotivosBaja, dictController.createMotivoBaja, dictController.updateMotivoBaja, dictController.deleteMotivoBaja);
router.post('/proveedores/reseed', authenticateToken, requireRole(['ADMIN']), dictController.reseedProveedores);

router.get('/asset-names-by-category', authenticateToken, dictController.getAssetNamesByCategory);
router.get('/brands-by-category', authenticateToken, dictController.getBrandsByCategory);

module.exports = router;
