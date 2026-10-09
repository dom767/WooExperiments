(function () {
  var canvas = document.getElementById('bg-canvas');
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Concentric rings of nodes. Each ring spins at its own speed; nodes chase
  // their rotating target position via a spring-damper, so the lattice lags
  // and wobbles elastically rather than rotating as a rigid wheel.
  var ringDefs = [
    { count: 10, radiusFrac: 0.40, speed: 0.11, skip: 2, color: 'rgba(242, 165, 68, 0.11)' },
    { count: 12, radiusFrac: 0.66, speed: -0.075, skip: 3, color: 'rgba(111, 184, 174, 0.10)' },
    { count: 14, radiusFrac: 0.95, speed: 0.05, skip: 4, color: 'rgba(242, 165, 68, 0.08)' }
  ];
  var spokeColor = 'rgba(246, 239, 226, 0.05)';
  var springK = 46;
  var damping = 7.5;

  var W = 0, H = 0, cx = 0, cy = 0, baseRadius = 0, dpr = 1;
  var nodes = [];

  function buildNodes() {
    nodes = ringDefs.map(function (ring) {
      var radius = baseRadius * ring.radiusFrac;
      var ringNodes = [];
      for (var i = 0; i < ring.count; i++) {
        var angle = (i / ring.count) * Math.PI * 2;
        ringNodes.push({
          angle: angle,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: 0,
          vy: 0
        });
      }
      return ringNodes;
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H / 2;
    baseRadius = Math.min(W, H) * 0.78;
    buildNodes();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ringDefs.forEach(function (ring, ringIndex) {
      var ringNodes = nodes[ringIndex];
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i < ringNodes.length; i++) {
        var a = ringNodes[i];
        var b = ringNodes[(i + ring.skip) % ringNodes.length];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    });

    ctx.strokeStyle = spokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var r = 0; r < nodes.length - 1; r++) {
      var inner = nodes[r], outer = nodes[r + 1];
      var count = Math.min(inner.length, outer.length);
      for (var j = 0; j < count; j++) {
        ctx.moveTo(inner[j].x, inner[j].y);
        ctx.lineTo(outer[j].x, outer[j].y);
      }
    }
    ctx.stroke();
  }

  var lastTime = null;

  function step(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    var dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    ringDefs.forEach(function (ring, ringIndex) {
      var ringNodes = nodes[ringIndex];
      var radius = baseRadius * ring.radiusFrac;
      for (var i = 0; i < ringNodes.length; i++) {
        var node = ringNodes[i];
        node.angle += ring.speed * dt;
        var targetX = cx + Math.cos(node.angle) * radius;
        var targetY = cy + Math.sin(node.angle) * radius;
        var ax = springK * (targetX - node.x) - damping * node.vx;
        var ay = springK * (targetY - node.y) - damping * node.vy;
        node.vx += ax * dt;
        node.vy += ay * dt;
        node.x += node.vx * dt;
        node.y += node.vy * dt;
      }
    });

    draw();
    requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize);
  resize();

  if (reduceMotion) {
    draw();
  } else {
    requestAnimationFrame(step);
  }
})();
