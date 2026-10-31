import { STARTS, EIGHTHS, type Location, type Marble, type Seat } from '@marble/engine';
export type Point = readonly [number, number];
function rotate([x, y]: Point, seat: number): Point {
  for (let n = 0; n < seat; n++) [x, y] = [y, 800 - x];
  return [x, y];
}
// One physical 18-hole segment; global indices follow the printed arrows.
const segment: Point[] = [
  [58, 400],
  [58, 450],
  [58, 500],
  [58, 550],
  [102, 550],
  [146, 546],
  [188, 536],
  [228, 520],
  [263, 496],
  [292, 466],
  [316, 435],
  [329, 478],
  [338, 521],
  [344, 564],
  [348, 607],
  [351, 650],
  [356, 693],
  [372, 736],
];
export const trackCoordinates = Array.from({ length: 72 }, (_, index) =>
  rotate(segment[index % 18]!, Math.floor(index / 18)),
);
export const homeCoordinates = Array.from({ length: 4 }, (_, seat) =>
  [120, 165, 210, 255].map((x) => rotate([x, 400], seat)),
);
export const breakCoordinates = Array.from({ length: 4 }, (_, seat) =>
  [
    [155, 170],
    [207, 170],
    [155, 222],
    [207, 222],
  ].map((p) => rotate(p as [number, number], seat)),
);
export const heavenCoordinate: Point = [400, 400];
export const seatStartIndex = STARTS;
export const seatEighthIndex = EIGHTHS;
export const seatHomeEntryIndex = STARTS;
export function locationPoint(location: Location, owner: Seat, marbleIndex = 0): Point {
  switch (location.kind) {
    case 'track':
      return trackCoordinates[location.index]!;
    case 'home':
      return homeCoordinates[owner]![location.slot]!;
    case 'heaven':
      return heavenCoordinate;
    case 'break':
      return breakCoordinates[owner]![marbleIndex]!;
  }
}
export function marblePoint(m: Marble): Point {
  return locationPoint(m.location, m.owner, Number(m.id.split(':')[1]));
}
