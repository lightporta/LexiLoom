// Serialized into the browser and called with the real panel as `this`.
// Seek the actual CSS transition instead of relying on rAF delivering a frame
// inside a wall-clock deadline on a busy CI runner.
export async function probeExpansion({ stallMs = 0 } = {}) {
  const width = () => this.getBoundingClientRect().width;
  const collapsed = width(); // Flush the collapsed style before the click.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.querySelector('.summary').click();
  const afterClick = width(); // Flush the new style to create the transition.
  const transition = this.getAnimations().find(animation => animation.transitionProperty === 'width');
  if (!transition) return { collapsed, expanded: afterClick, reducedMotion, samples: [], duration: null };

  // Capture and pause in this same task, before the runner can skip frames.
  transition.pause();
  const { duration, easing } = transition.effect.getTiming();
  const stallStart = performance.now();
  while (performance.now() - stallStart < stallMs) { /* Deliberate QA-only dropped-frame regression. */ }
  const samples = [0.25, 0.5, 0.75].map(progress => {
    transition.currentTime = Number(duration) * progress;
    return { progress, width: width() };
  });
  // Let the remaining transition complete naturally; no fixed frame deadline.
  transition.play();
  await transition.finished;
  await Promise.all(this.getAnimations({ subtree: true }).map(animation => animation.finished));
  return { collapsed, samples, expanded: width(), duration, easing, reducedMotion, stallMs };
}

export function hasLinearExpansion(probe) {
  if (!probe || probe.reducedMotion || probe.duration !== 280 || probe.easing !== 'linear') return false;
  if (Math.abs(probe.collapsed - 312) > 0.5 || Math.abs(probe.expanded - 424) > 0.5) return false;
  return probe.samples.length === 3 && probe.samples.every(({ progress, width }) =>
    Math.abs(width - (probe.collapsed + (probe.expanded - probe.collapsed) * progress)) <= 0.5);
}
