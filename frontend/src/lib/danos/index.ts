// Estimador de daños — API pública del motor determinístico.
export * from './types'
export * from './constantes'
export { valorPresenteRenta, calcularIncapacidad1746 } from './patrimonial'
export { inferirGravedad, calcularNoPatrimonial } from './no-patrimonial'
export { evaluarProcedencia, cuantificarPunitivo } from './punitivo'
export { diasEntre, calcularIntereses } from './intereses'
export { generarAlertas } from './alertas'
export { calcularDanos } from './escenarios'
