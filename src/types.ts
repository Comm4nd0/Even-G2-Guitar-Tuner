export interface TuningString {
  note: string;
  frequency: number;
}

export interface TuningMode {
  name: string;
  strings: TuningString[];
}

export interface DetectionResult {
  frequency: number;
  noteName: string;
  octave: number;
  centsOff: number;
  nearestString: TuningString | null;
  inTune: boolean;
}
