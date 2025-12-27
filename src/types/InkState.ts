import { useState } from "react";

type SetStateAction<T> = T | ((prevState: T) => T);

type Dispatch<T> = (value: SetStateAction<T>) => void;

export type StateTuple<T> = [T, Dispatch<T>];

export function useInkState<T>(initialState: T): StateTuple<T> {
  const [value, setValue] = useState<T>(initialState);
  return [value, setValue];
}
