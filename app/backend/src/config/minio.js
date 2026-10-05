const Minio = require('minio');

// Initialize Minio client
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'servicio-minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin_minio',
  secretKey: process.env.MINIO_SECRET_KEY || 'admin_minio_activos_2026'
});

const BUCKET_PENDIENTES = 'activos-pendientes';
const BUCKET_ACEPTACIONES = 'activos-aceptaciones';
const BUCKET_FOTOS = 'activos-fotos';
const BUCKET_DOCUMENTOS = 'activos-documentos';

// Auto-create buckets on startup
async function initMinio() {
  try {
    const buckets = [BUCKET_PENDIENTES, BUCKET_ACEPTACIONES, BUCKET_FOTOS, BUCKET_DOCUMENTOS];
    for (const bucket of buckets) {
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) {
        await minioClient.makeBucket(bucket, 'us-east-1');
        console.log(`📦 [MinIO] Bucket creado exitosamente: ${bucket}`);
        
        // Configurar política de lectura pública para el bucket de fotos
        if (bucket === BUCKET_FOTOS) {
          const policy = {
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'PublicRead',
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`]
              }
            ]
          };
          await minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
          console.log(`🔓 [MinIO] Política pública configurada para el bucket: ${bucket}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ [MinIO] Error al inicializar buckets:', err);
  }
}

module.exports = {
  minioClient,
  initMinio,
  BUCKET_PENDIENTES,
  BUCKET_ACEPTACIONES,
  BUCKET_FOTOS,
  BUCKET_DOCUMENTOS
};
