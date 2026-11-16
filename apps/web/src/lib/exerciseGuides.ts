/**
 * Plain-words help for the seeded home exercises: what each move is for, and one tip. Keyed by exercise slug.
 */
export type Guide = {
  /** What the move is for, in plain words. */
  purpose: string
  tip: string
}

export const GUIDES: Record<string, Guide> = {
  'bodyweight-squat': {
    purpose: 'Builds strength in your thighs and hips for everyday moves like sitting down, standing up and climbing stairs.',
    tip: 'Keep your heels on the floor and your knees in line with your toes.',
  },
  'chair-sit-to-stand': {
    purpose: 'Strengthens the legs you use to get out of a chair, a car or bed. A great starting point.',
    tip: 'Lean forward a little before you stand, and lower yourself slowly instead of dropping.',
  },
  'glute-bridge': {
    purpose: 'Strengthens your bottom and the back of your thighs, which supports your lower back.',
    tip: 'Squeeze your glutes at the top. Do not arch your lower back.',
  },
  'low-step-up': {
    purpose: 'Builds leg strength and balance for climbing stairs.',
    tip: 'Push through the heel of the foot on the step, and hold a wall or rail if you need to.',
  },
  'calf-raise': {
    purpose: 'Strengthens your calves and ankles for walking, balance and steady feet.',
    tip: 'Go up and down slowly. Do not bounce.',
  },
  'side-lying-leg-raise': {
    purpose: 'Works the side of your hips, which keeps you steady when you walk.',
    tip: 'Keep your hips stacked and lift only as high as you can without rolling back.',
  },
  clamshell: {
    purpose: 'Strengthens the muscles that steady your hips and knees.',
    tip: 'Keep your feet touching and do not let your top hip roll backwards.',
  },
  'reverse-lunge': {
    purpose: 'Builds strength and balance in each leg on its own.',
    tip: 'Keep your front knee over your ankle and your body upright.',
  },
  'wall-sit': {
    purpose: 'Builds endurance in your thighs without any moving.',
    tip: 'Breathe steadily the whole time. Only go as low as feels comfortable for your knees.',
  },
  'jump-squat': {
    purpose: 'Builds leg power and gets your heart rate up quickly.',
    tip: 'Land softly on the balls of your feet with your knees bent.',
  },
  'wall-push-up': {
    purpose: 'Builds chest and arm strength gently. The easiest push-up to start with.',
    tip: 'Keep your body in one straight line from head to heels.',
  },
  'knee-push-up': {
    purpose: 'Strengthens your chest, shoulders and arms, with less weight than a full push-up.',
    tip: 'Keep a straight line from your knees to your head. Do not let your hips sag.',
  },
  'push-up': {
    purpose: 'Strengthens your chest, shoulders, arms and core all at once.',
    tip: 'Squeeze your stomach and glutes so your body stays straight.',
  },
  'pike-push-up': {
    purpose: 'Builds strong shoulders and arms using your own body weight.',
    tip: 'Lower with control and keep your neck relaxed.',
  },
  'chair-dip': {
    purpose: 'Strengthens the back of your arms and your shoulders.',
    tip: 'Keep your back close to the chair and only go as low as your shoulders allow.',
  },
  'band-row': {
    purpose: 'Strengthens your upper back, which helps your posture.',
    tip: 'Squeeze your shoulder blades together and sit tall.',
  },
  'bottle-shoulder-press': {
    purpose: 'Strengthens your shoulders and arms using filled water bottles as light weights.',
    tip: 'Keep your stomach tight and do not lean back as you press.',
  },
  'bottle-bicep-curl': {
    purpose: 'Strengthens the front of your upper arms for lifting and carrying.',
    tip: 'Keep your elbows by your sides and lower slowly.',
  },
  'bird-dog': {
    purpose: 'Trains balance and the deep muscles that protect your back.',
    tip: 'Move slowly and keep your back flat, like a table.',
  },
  'dead-bug': {
    purpose: 'Strengthens your core while keeping your back safely supported on the floor.',
    tip: 'Press your lower back gently into the floor the whole time.',
  },
  superman: {
    purpose: 'Strengthens the muscles along your back for better posture.',
    tip: 'Lift only a little and look at the floor to keep your neck relaxed.',
  },
  crunch: {
    purpose: 'Strengthens the muscles at the front of your stomach.',
    tip: 'Curl up slowly and do not pull on your neck.',
  },
  plank: {
    purpose: 'Builds a strong, steady core that supports your back in everything you do.',
    tip: 'Do not let your hips sag or pike up. Keep breathing.',
  },
  'russian-twist': {
    purpose: 'Works the muscles at the sides of your stomach.',
    tip: 'Turn from your chest, not just your arms, and keep your back straight.',
  },
  'mountain-climber': {
    purpose: 'Gets your heart pumping and works your core and shoulders.',
    tip: 'Keep your hips level and your hands under your shoulders. Slow down if you need to.',
  },
  'brisk-walk': {
    purpose: 'The simplest way to move more each day. Good for your heart, mood and weight.',
    tip: 'Walk fast enough that you can talk but not sing.',
  },
  'march-in-place': {
    purpose: 'Warms up your body and raises your heart rate gently, with no space needed.',
    tip: 'Stand tall and swing your arms as you march.',
  },
  'step-touch': {
    purpose: 'A low-impact way to raise your heart rate, kind on your knees.',
    tip: 'Keep a steady rhythm and add an arm swing if it feels good.',
  },
  'jumping-jacks': {
    purpose: 'Raises your heart rate fast and works your whole body.',
    tip: 'Land softly. For no jumping, step one foot out at a time instead.',
  },
  'high-knees': {
    purpose: 'A quick burst of cardio that works your legs and core.',
    tip: 'Stay on the balls of your feet and keep your chest up.',
  },
  burpee: {
    purpose: 'A full-body move that builds strength and fitness at the same time.',
    tip: 'Go at your own pace. Stepping back instead of jumping is fine.',
  },
  'cat-cow': {
    purpose: 'Loosens your spine and eases a stiff back.',
    tip: 'Move with your breath: breathe in for cow, out for cat.',
  },
  'lying-hamstring-stretch': {
    purpose: 'Stretches the back of your thighs, which often get tight from sitting.',
    tip: 'Keep a soft bend in the knee if you need to. Feel a stretch, never pain.',
  },
  'shoulder-rolls': {
    purpose: 'Eases tension in your neck and shoulders. Good after time at a desk or phone.',
    tip: 'Make slow, big circles and keep your arms relaxed.',
  },
  'arm-circles': {
    purpose: 'Warms up your shoulders and gets blood moving before you exercise.',
    tip: 'Keep the circles small and controlled, and switch direction halfway.',
  },
  'standing-hip-flexor-stretch': {
    purpose: 'Stretches the front of your hips, which get tight from sitting for long periods.',
    tip: 'Squeeze the glute of your back leg and keep your body upright.',
  },
  'child-pose': {
    purpose: 'A calm resting stretch for your back, hips and shoulders.',
    tip: 'Breathe slowly and let your body sink a little with each breath out.',
  },
  'standing-quad-stretch': {
    purpose: 'Stretches the front of your thighs after walking or leg exercises.',
    tip: 'Keep your knees side by side and stand tall.',
  },
  'seated-spinal-twist': {
    purpose: 'Gently loosens your back and helps you breathe deeply.',
    tip: 'Sit up tall before you twist, and turn only as far as is comfortable.',
  },
}
