const TOTAL_ROWS = 32;
const TOTAL_COLUMNS = 39;
const CELL_SIZE = 20;

const DIRECTIONS = [
  // horizontal
  [-1, 1],
  // diagonal (left to right)
  [-1 - (TOTAL_COLUMNS - 1), 1 + (TOTAL_COLUMNS - 1)],
  // vertical
  [-(TOTAL_COLUMNS - 1), (TOTAL_COLUMNS - 1)],
  // diagonal (right to left)
  [1 - (TOTAL_COLUMNS - 1), -1 + (TOTAL_COLUMNS - 1)]
];

const body = document.getElementById("body");

/**
 * @type {HTMLCanvasElement}
 */
const field = document.getElementById("field");
const canvas = field.getContext("2d");

canvas.lineWidth = 1;

canvas.beginPath();

for (let r = 1; r < TOTAL_ROWS; r++) {
  canvas.moveTo(0, r * CELL_SIZE);
  canvas.lineTo(field.offsetWidth, r * CELL_SIZE);
}

for (let c = 1; c < TOTAL_COLUMNS; c++) {
  canvas.moveTo(c * CELL_SIZE, 0);
  canvas.lineTo(c * CELL_SIZE, field.offsetHeight);
}

canvas.stroke();

/**
 * @type {boolean[]}
 */
const occupiedDots = [];

/**
 * @type {number[][]}
 */
const unions = [];

/**
 * @type {number[]}
 */
const leaders = [];

for (let r = 2; r <= TOTAL_ROWS; r++) {
  for (let c = 2; c <= TOTAL_COLUMNS; c++) {
    const dot = document.createElement("div");
    const dotId = (r - 2) * (TOTAL_COLUMNS - 1) + c - 2;
    dot.id = dotId.toString();
    dot.classList.add(
      `left-[${field.offsetLeft + 20 * (c - 1) - 4}px]`,
      `top-[${field.offsetTop + 20 * (r - 1) - 4}px]`,
      "absolute", "w-2", "h-2", "cursor-pointer",
      // "bg-white", "rounded-full", "border", "border-gray-900"
    );

    occupiedDots[dotId] = false;

    dot.onclick = () => {
      const dotId = Number(dot.id);

      if (occupiedDots[dotId]) return;

      occupiedDots[dotId] = true;

      dot.classList.add("rounded-full", "bg-blue-700");

      let dotIsInUnion = false;

      // TODO: not only polar unions can be merged e.g. NW and SW
      for (let direction of DIRECTIONS) {
        const firstOccupiedDot = occupiedDots[dotId + direction[0]]
          ? dotId + direction[0]
          : occupiedDots[dotId + direction[1]]
            ? dotId + direction[1]
            : undefined;

        if (firstOccupiedDot === undefined) continue;
        
        const firstLeader = leaders[firstOccupiedDot];
        unions[firstLeader].push(dotId);
        leaders[dotId] = firstLeader;
        dotIsInUnion = true;

        if (occupiedDots[dotId + direction[0]] && occupiedDots[dotId + direction[1]]) {
          const secondLeader = leaders[dotId + direction[1]];
          if (secondLeader !== firstLeader) {
            unions[firstLeader].push(...unions[secondLeader]);
            unions[secondLeader].forEach(x => leaders[x] = firstLeader);
            unions[secondLeader] = undefined;
          }
        }

        break;
      }

      if (!dotIsInUnion) {
        unions[dotId] = [dotId];
        leaders[dotId] = dotId;
      }

      console.log(unions);
      console.log(leaders);
    }

    body.append(dot);
  }
}