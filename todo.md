## TODO:

- [x] [Bug] adjacent polygon can be not only horizontal
- [x] [Optimization] cycle detection takes a lot of time as the size of a union grows
- [x] [Bug] forbid creating polygon that intersects with existing ones
- [ ] [Refactoring] https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/isPointInPath - alternative to ray cast
- [x] [Bug] 2 dots on a distance of more than 1 cell can be connected in a polygon
- [ ] [Bug] polygon wasn't detected
- [x] [Bug] polygon was detected twice
- [ ] [Feature] timer
- [ ] [Feature] increase maximum room size from 4 to 8
- [ ] [Feature] multiple rooms
- [ ] [Feature] thread-safe SignalR hub
- [ ] [Feature] allow joining started games
- [ ] [Feature] highlight recently placed dot
- [ ] [Feature] allow user input to fill player's name
- [ ] [Refactoring] improve logging
- [ ] [Optimization] handling own dots inside a polygon can introduce tens of thousands of additional iterations over polygon's dots when polygon has size of a classic field and a lot of own dots are inside it