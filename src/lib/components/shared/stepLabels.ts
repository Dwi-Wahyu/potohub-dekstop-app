/**
 * Canonical stepper labels — shared so desktop & admin-dashboard preview
 * render identical indicators for the same template_variant + ui_step.
 *
 * V2: editorial pill stepper (labels shown).
 * V3: film-strip numbered stepper (keys rendered as number/dot, per
 *     booth-client-refference/BoothClientV3.tsx VISIBLE_STEPS).
 */
export const V2_STEPPER_LABELS = [
  'Tutorial',
  'Payment',
  'Frames',
  'Photo Session',
  'Edit & Filter',
  'Scan File'
];

export const V3_STEPPER_LABELS = ['package', 'payment', 'frame', 'session', 'filter'];
