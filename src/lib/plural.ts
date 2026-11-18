/**
 * Russian plural: returns `n` + correct word form.
 * one = «1 ход», few = «2 хода», many = «5 ходов»
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
  if (m10 === 1) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const pluralMoves = (n: number) => plural(n, 'ход', 'хода', 'ходов');
export const pluralTries = (n: number) => plural(n, 'попытка', 'попытки', 'попыток');
export const pluralPositions = (n: number) => plural(n, 'позиция', 'позиции', 'позиций');
export const pluralLines = (n: number) => plural(n, 'линия', 'линии', 'линий');
export const pluralGames = (n: number) => plural(n, 'партия', 'партии', 'партий');
export const pluralVariations = (n: number) => plural(n, 'вариация', 'вариации', 'вариаций');
export const pluralErrors = (n: number) => plural(n, 'ошибка', 'ошибки', 'ошибок');
export const pluralPoints = (n: number) => plural(n, 'очко', 'очка', 'очков');
export const pluralPuzzles = (n: number) => plural(n, 'задача', 'задачи', 'задач');
export const pluralSeconds = (n: number) => plural(n, 'секунда', 'секунды', 'секунд');
