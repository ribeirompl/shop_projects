/* ==========================================================================
   seed.js — the week of 31 Aug 2026 as it stood in ShiftHoursEntry.xlsm,
   so the tool opens with a realistic roster to experiment on. Extracted
   from the workbook, not typed in; Joshua's two rows were merged into
   split shifts. A cell is "7-4", "OFF", "", or ["9-8", "LSTORE"] when the
   name was colour-coded in the sheet.
   ========================================================================== */

export const SEED_WEEK = '2026-08-31';

export const SEED_STAFF = [
  ['Jana',        'permanent', ['7-4',['9-8','LSTORE'],'OFF',['9-8','LSTORE'],'11-8',['9-8','LSTORE'],'OFF']],
  ['Chanelle',    'permanent', [['9-8','LSTORE'],['9-8','LSTORE'],['9-8','LSTORE'],'OFF',['9-8','LSTORE'],'9-6','9-7']],
  ['Anita',       'permanent', ['7-5','7-5','7-5','7-5','OFF','7-2','7-2']],
  ['Alissa',      'permanent', ['9-8','OFF','9-8','12-8','7-4','9-8','OFF']],
  ['Janine',      'permanent', ['11-8','9-8','OFF','8-6','12-8','8-5','9-8']],
  ['Yvonne',      'permanent', ['9-5','9-5','9-5','OFF','9-5',['9-8','LSTORE'],['11-6','LSTORE']]],
  ['Loretta',     'permanent', [['9-8','LSTORE'],'OFF',['9-8','LSTORE'],['11-8','LSTORE'],['9-8','LSTORE'],'OFF','7-4']],
  ['Anke',        'permanent', ['OFF','9-6','10-7','9-7','OFF','9-6','9-4']],
  ['Sive',        'permanent', ['7-5','7-5','7-5','7-5','7-5','7-4','']],
  ['Celiwe',      'permanent', ['7-5','7-5','7-5','7-5','7-5','OFF','']],
  ['Jayden',      'casual',    ['OFF','11-8','9-7','OFF','9-7','11-7','11-6']],
  ['Jorja',       'casual',    ['9-7','9-7','OFF','9-7','9-5','7-5','8-5']],
  ['Jorha-leigh', 'casual',    ['OFF','OFF','OFF','OFF','5-8','OFF','9-2']],
  ['Sipha',       'casual',    ['OFF','2-8','2-8','4-8','2-8','9-3','2-8']],
  ['Gavin',       'casual',    ['3-8','4-8','OFF','9-2','OFF','12-8','OFF']],
  ['Christo',     'casual',    ['10-6','8-2','11-8','10-4','7-3','OFF','9-4']],
  ['Joshua',      'casual',    ['5-8','OFF','8-12, 5-8','5-8','9-2, 5-8','','4-8']],
  ['Elijah',      'casual',    ['OFF','OFF','OFF','OFF','5-8','2-8','4-8']],
  ['Sasha',       'casual',    ['5-8','5-8','OFF','5-8','OFF','4-8','']],
  ['Jolene',      'permanent', ['9-6','9-6','9-2','9-6','9-6','9-2','9-4']],
  ['Hershell',    'permanent', ['8-6','8-6','8-2','8-6','8-6','8-6','8-6']],
  ['Shaun',       'permanent', ['7-2','7-5','9-7','9-7','7-5','7-4','7-2']],
  ['Alex',        'permanent', ['OFF',['9-8','LSTORE'],['9-8','LSTORE'],['9-8','LSTORE'],['9-8','LSTORE'],['9-8','LSTORE'],['11-6','LSTORE']]],
  ['Eben',        'permanent', ['12-8','10-8','8-6','OFF','9-6','9-6','7-2']],
  ['Joan',        'permanent', ['OFF','7-5','12-8','9-6','12-8','OFF','OFF']],
  ['Nadine',      'permanent', ['12-8','12-8','7-5','10-7','9-6','9-8','9-7']],
  ['Mikayla',     'permanent', ['12-8','12-8','10-7','7-5','10-7','8-6','9-8']],
  ['Marjorie',    'permanent', ['10-7','OFF','12-8','12-8','7-5','OFF','OFF']],
  ['Debbie',      'permanent', ['7-5','10-7','OFF','12-8','12-8','9-8','OFF']],
  ['Morne',       'permanent', [['11-8','LSTORE'],'9-6','OFF','12-8','11-8','1-8','OFF']],
  ['Chiara',      'casual',    ['','','','','','7-2','7-2']],
  ['Sofie',       'casual',    ['','','','','','**','**']]
];
