// Heure du serveur en millisecondes : transmise à l'écran du tournage pour caler son chrono sur
// l'horloge du serveur plutôt que sur celle de l'appareil.
export function serverNow(): number {
  return Date.now();
}
