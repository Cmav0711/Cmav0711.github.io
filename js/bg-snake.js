(() => {
  const canvas = document.getElementById("bgSnake");
  if (!canvas) {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    canvas.style.display = "none";
    return;
  }

  const ctx = canvas.getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  const colorSnake = styles.getPropertyValue("--accent").trim() || "#5cffcc";
  const colorFood = styles.getPropertyValue("--link").trim() || "#7fe8ff";
  const colorBoard = styles.getPropertyValue("--surface-alt").trim() || "#0f161a";
  const colorBorder = styles.getPropertyValue("--accent-soft").trim() || "rgba(92, 255, 204, 0.25)";

  const gridSize = 18;
  const minTiles = 14;
  const speedMs = 90;
  const populationSize = 20;
  const eliteRatio = 0.2;
  const mutationRate = 0.08;
  const mutationScale = 0.35;
  const maxStarve = 140;

  let gridWidth = 24;
  let gridHeight = 24;
  let generation = 1;
  let population = [];
  let bestAgent = null;
  let timerId = null;
  const stepsPerFrame = 2;

  const storedBest = localStorage.getItem("bgSnakeBest");
  let bestWeights = null;
  if (storedBest) {
    try {
      bestWeights = JSON.parse(storedBest);
    } catch (error) {
      bestWeights = null;
    }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const pageWidth = Math.max(
      document.documentElement.clientWidth,
      document.body.scrollWidth,
      window.innerWidth
    );
    const pageHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    );
    const width = Math.max(pageWidth, 320);
    const height = Math.max(pageHeight, 320);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gridWidth = Math.max(Math.floor(width / gridSize), minTiles);
    gridHeight = Math.max(Math.floor(height / gridSize), minTiles);

    initPopulation();
  }

  function initPopulation() {
    population = [];
    for (let i = 0; i < populationSize; i += 1) {
      const weights = i === 0 && bestWeights ? [...bestWeights] : randomWeights();
      population.push(createAgent(weights));
    }
    bestAgent = population[0];
  }

  function createAgent(weights) {
    const startX = Math.floor(Math.random() * (gridWidth - 6)) + 3;
    const startY = Math.floor(Math.random() * (gridHeight - 6)) + 3;
    const agent = {
      weights,
      snake: [
        { x: startX, y: startY },
        { x: startX - 1, y: startY },
        { x: startX - 2, y: startY }
      ],
      direction: { x: 1, y: 0 },
      food: { x: 0, y: 0 },
      alive: true,
      score: 0,
      steps: 0,
      stepsSinceFood: 0
    };
    placeFood(agent);
    return agent;
  }

  function resetAgent(agent) {
    const startX = Math.floor(Math.random() * (gridWidth - 6)) + 3;
    const startY = Math.floor(Math.random() * (gridHeight - 6)) + 3;
    agent.snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY }
    ];
    agent.direction = { x: 1, y: 0 };
    agent.alive = true;
    agent.score = 0;
    agent.steps = 0;
    agent.stepsSinceFood = 0;
    placeFood(agent);
  }

  function placeFood(agent) {
    let next;
    do {
      next = {
        x: Math.floor(Math.random() * gridWidth),
        y: Math.floor(Math.random() * gridHeight)
      };
    } while (agent.snake.some((segment) => segment.x === next.x && segment.y === next.y));
    agent.food = next;
  }

  function isCollision(agent, point) {
    if (point.x < 0 || point.y < 0 || point.x >= gridWidth || point.y >= gridHeight) {
      return true;
    }
    return agent.snake.some((segment) => segment.x === point.x && segment.y === point.y);
  }

  function turnLeft(dir) {
    return { x: dir.y, y: -dir.x };
  }

  function turnRight(dir) {
    return { x: -dir.y, y: dir.x };
  }

  function getFeatures(agent) {
    const head = agent.snake[0];
    const straight = { x: head.x + agent.direction.x, y: head.y + agent.direction.y };
    const leftDir = turnLeft(agent.direction);
    const rightDir = turnRight(agent.direction);
    const left = { x: head.x + leftDir.x, y: head.y + leftDir.y };
    const right = { x: head.x + rightDir.x, y: head.y + rightDir.y };

    const dangerStraight = isCollision(agent, straight) ? 1 : 0;
    const dangerLeft = isCollision(agent, left) ? 1 : 0;
    const dangerRight = isCollision(agent, right) ? 1 : 0;

    const foodLeft = agent.food.x < head.x ? 1 : 0;
    const foodRight = agent.food.x > head.x ? 1 : 0;
    const foodUp = agent.food.y < head.y ? 1 : 0;
    const foodDown = agent.food.y > head.y ? 1 : 0;

    const dirLeft = agent.direction.x === -1 ? 1 : 0;
    const dirRight = agent.direction.x === 1 ? 1 : 0;
    const dirUp = agent.direction.y === -1 ? 1 : 0;
    const dirDown = agent.direction.y === 1 ? 1 : 0;

    return [
      dangerStraight,
      dangerLeft,
      dangerRight,
      foodLeft,
      foodRight,
      foodUp,
      foodDown,
      dirLeft,
      dirRight,
      dirUp,
      dirDown,
      1
    ];
  }

  function randomWeights() {
    const weights = [];
    const featureCount = 12;
    for (let i = 0; i < 3 * featureCount; i += 1) {
      weights.push(Math.random() * 2 - 1);
    }
    return weights;
  }

  function pickAction(agent) {
    const features = getFeatures(agent);
    const featureCount = features.length;
    let bestAction = 0;
    let bestScore = -Infinity;
    for (let action = 0; action < 3; action += 1) {
      let score = 0;
      const offset = action * featureCount;
      for (let i = 0; i < featureCount; i += 1) {
        score += agent.weights[offset + i] * features[i];
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    return bestAction;
  }

  function applyAction(agent, action) {
    if (action === 1) {
      agent.direction = turnLeft(agent.direction);
    } else if (action === 2) {
      agent.direction = turnRight(agent.direction);
    }
  }

  function stepAgent(agent) {
    if (!agent.alive) {
      return;
    }

    const action = pickAction(agent);
    applyAction(agent, action);

    const head = agent.snake[0];
    const nextHead = { x: head.x + agent.direction.x, y: head.y + agent.direction.y };

    if (isCollision(agent, nextHead) || agent.stepsSinceFood > maxStarve) {
      agent.alive = false;
      return;
    }

    agent.snake.unshift(nextHead);
    agent.steps += 1;
    agent.stepsSinceFood += 1;

    if (nextHead.x === agent.food.x && nextHead.y === agent.food.y) {
      agent.score += 1;
      agent.stepsSinceFood = 0;
      placeFood(agent);
    } else {
      agent.snake.pop();
    }
  }

  function fitness(agent) {
    return agent.score * 100 + agent.steps * 0.5;
  }

  function evolve() {
    const sorted = [...population].sort((a, b) => fitness(b) - fitness(a));
    bestAgent = sorted[0];
    bestWeights = [...bestAgent.weights];
    localStorage.setItem("bgSnakeBest", JSON.stringify(bestWeights));

    const eliteCount = Math.max(2, Math.floor(populationSize * eliteRatio));
    const elites = sorted.slice(0, eliteCount);
    const nextPopulation = elites.map((agent) => createAgent([...agent.weights]));

    while (nextPopulation.length < populationSize) {
      const parentA = elites[Math.floor(Math.random() * elites.length)];
      const parentB = elites[Math.floor(Math.random() * elites.length)];
      const childWeights = crossover(parentA.weights, parentB.weights);
      mutate(childWeights);
      nextPopulation.push(createAgent(childWeights));
    }

    population = nextPopulation;
    generation += 1;
  }

  function crossover(a, b) {
    const child = [];
    for (let i = 0; i < a.length; i += 1) {
      child.push(Math.random() < 0.5 ? a[i] : b[i]);
    }
    return child;
  }

  function mutate(weights) {
    for (let i = 0; i < weights.length; i += 1) {
      if (Math.random() < mutationRate) {
        weights[i] += (Math.random() * 2 - 1) * mutationScale;
      }
    }
  }

  function step() {
    for (let s = 0; s < stepsPerFrame; s += 1) {
      let aliveCount = 0;
      population.forEach((agent) => {
        stepAgent(agent);
        if (agent.alive) {
          aliveCount += 1;
        }
      });

      if (aliveCount === 0) {
        evolve();
      }
    }
    draw();
  }

  function drawAgent(agent, snakeAlpha, foodAlpha) {
    if (!agent.alive) {
      return;
    }

    ctx.globalAlpha = foodAlpha;
    ctx.fillStyle = colorFood;
    ctx.fillRect(
      agent.food.x * gridSize + 4,
      agent.food.y * gridSize + 4,
      gridSize - 8,
      gridSize - 8
    );

    ctx.globalAlpha = snakeAlpha;
    ctx.fillStyle = colorSnake;
    agent.snake.forEach((segment, index) => {
      const inset = index === 0 ? 2 : 4;
      ctx.fillRect(
        segment.x * gridSize + inset,
        segment.y * gridSize + inset,
        gridSize - inset * 2,
        gridSize - inset * 2
      );
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = colorBoard;
    ctx.fillRect(0, 0, gridWidth * gridSize, gridHeight * gridSize);

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = colorBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, gridWidth * gridSize, gridHeight * gridSize);

    population.forEach((agent) => drawAgent(agent, 0.22, 0.35));
    if (bestAgent && bestAgent.alive) {
      drawAgent(bestAgent, 0.8, 0.95);
    }

    ctx.globalAlpha = 1;
  }

  function start() {
    if (timerId) {
      return;
    }
    timerId = setInterval(step, speedMs);
  }

  resize();
  window.addEventListener("resize", resize);
  start();
})();
