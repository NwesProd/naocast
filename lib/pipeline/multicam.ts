// Synchro + switch multicam automatique, VOLONTAIREMENT NON IMPLÉMENTÉ.
//
// Le brief le place dans le scope du MVP mais demande explicitement de le
// construire en dernier : c'est le morceau le plus risqué techniquement,
// largement plus lourd que le reste du pipeline. Le reste du pipeline
// (autocut, découpe manuelle, incrustation générique/logo, rendu, export
// audio) doit être solide sur le cas simple (pré-montage / caméra unique)
// avant de s'y attaquer.
//
// Deux sous-problèmes distincts à résoudre le moment venu :
//
// 1. Synchronisation temporelle des flux caméras (pas de timecode commun)
//    → recalage par corrélation audio entre les pistes de chaque caméra.
//      Piste concrète : extraire l'audio de chaque caméra (ffmpeg), calculer
//      le décalage par cross-corrélation (ex. via un signal traité en Node/
//      Python, ou `ffmpeg`'s propre filtre n'étant pas suffisant seul,
//      probablement un script Python numpy/scipy appelé en sous-processus).
//
// 2. Détection du locuteur actif + switch caméra
//    → pyannote-audio pour la diarization (qui parle quand), à partir de
//      l'audio déjà nécessaire pour la transcription (Whisper). Il faut
//      ensuite une logique de switch qui évite les changements trop
//      fréquents/saccadés (ex. durée minimale par plan, hystérésis).
//
// Avant de recoder quoi que ce soit ici : évaluer pyannote-audio (diarization)
// + Whisper (transcription, déjà en place dans transcribe.ts) + ffmpeg
// (corrélation audio + composition finale) plutôt que réinventer la détection
// de locuteur ou la synchro audio from scratch.
//
// En attendant cette implémentation, un épisode marqué CameraSetup.MULTI_CAMERA
// ne doit PAS être traité par le pipeline automatique (cf. worker/pipeline.ts) :
// l'utilisateur est redirigé vers l'option "faire appel à un monteur".

export class MulticamNotImplementedError extends Error {
  constructor() {
    super(
      "La synchro/switch multicam automatique n'est pas encore disponible. " +
        "Pour un épisode tourné en caméras séparées non synchronisées, passez par l'option montage humain."
    );
    this.name = "MulticamNotImplementedError";
  }
}

export async function syncAndSwitchMulticam(): Promise<never> {
  throw new MulticamNotImplementedError();
}
