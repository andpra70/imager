import { matitaDefaults, type MatitaOptions, validateMatitaOptions } from "../matita/model";
export interface MatitaSplineOptions extends MatitaOptions { bend: number }
export const matitaSplineDefaults: MatitaSplineOptions = { ...matitaDefaults, bend: 1.8 };
export function validateMatitaSplineOptions(options: MatitaSplineOptions) {
  validateMatitaOptions(options);
  if (!Number.isFinite(options.bend) || options.bend < .2 || options.bend > 8) throw Error("Deviazione controllo fuori intervallo");
}
