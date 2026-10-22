/**
 * Build de producción (`ng build`). La URL de la API NO es un secreto: es la dirección pública del backend de Mi renta.
 * Vacía hasta que exista un despliegue; con valor vacío la app muestra «servicio no configurado».
 * Nunca pongas aquí contraseñas, claves ni tokens: todo lo que está en Angular lo puede leer cualquier visitante.
 */
export const environment = {
  production: true,
  apiUrl: '',
};
