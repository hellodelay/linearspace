// Placeholder pilot cast: portrait specs and combat chatter, keyed by unit def id.
// Pilot assignment is not implemented yet, so each unit type has a fixed pilot. Presentation-only data.
//
// Line triggers: start, signature (first attack), kill, death, lowHp, healed, allyDown, overtime, victory.

export const CAST = Object.freeze({
  // ---- Player ----
  bulwark: {
    pilot: 'Ida Brannock',
    callsign: 'ANVIL',
    portrait: { id: 'ida', skin: '#f1c9a5', hair: '#c9d2dc', hairStyle: 'short', eyes: '#e0a030', suit: '#24425a', accent: '#3cf0ff', bg: '#1d5a6e', scar: true },
    lines: {
      start: ['Anvil on point. Stay behind me.', 'Shields up. Let them come.'],
      signature: ['Contact. Holding the line.', 'You want them? Go through me.'],
      kill: ['One down. Next.', 'Stay down.', 'Line holds.'],
      lowHp: ['Armor is buckling... still standing!', 'Took a bad one. Keep firing!'],
      death: ['Line is broken... sorry, everyone.', 'Anvil is down!'],
      healed: ['Good timing, Lullaby.', 'Patched. Back to it.'],
      allyDown: ['Close ranks! Cover the gap!', 'Damn it. Keep them off the others!'],
      overtime: ['Hulls are failing. End this now!'],
      victory: ['Sector clear. Good work, all of you.', 'That is how you hold a line.'],
    },
  },
  lancer: {
    pilot: 'Kaz Mirelli',
    callsign: 'SPARK',
    portrait: { id: 'kaz', skin: '#f6d2b0', hair: '#ffd23a', hairStyle: 'spiky', eyes: '#ff4040', suit: '#3a2a10', accent: '#fff04a', bg: '#6a5a10' },
    lines: {
      start: ["Let's make this quick!", 'Spark is go! Try to keep up!'],
      signature: ['Found a weak one!', 'Lancer, engaging!'],
      kill: ['Too slow!', 'Next!', "That's how it's done!"],
      lowHp: ['They actually hit me?!', "I'm fine! I'm fine! ...I'm not fine."],
      death: ['No way... Spark is going down!', 'Ejecting! This is so embarrassing!'],
      healed: ['Appreciate it, Doc!', 'Ha! Good as new!'],
      allyDown: ["Hey! They're gonna pay for that!", 'No no no... I got your back!'],
      overtime: ['Reactor is cooking! Finish it!'],
      victory: ['Flawless. Mostly.', 'Did you see that? Tell me you saw that.'],
    },
  },
  arc: {
    pilot: 'Seren Vale',
    callsign: 'HALO',
    portrait: { id: 'seren', skin: '#f3d8c4', hair: '#9b6bff', hairStyle: 'long', eyes: '#c79bff', suit: '#2a1a44', accent: '#b46bff', bg: '#3a2066' },
    lines: {
      start: ['Arc capacitors charged. Beginning.', 'Calculating firing lines.'],
      signature: ['Clear the lane. Firing.', 'Line them up for me.'],
      kill: ['Target dispersed.', 'Exactly as calculated.', 'Gone.'],
      lowHp: ['Shield integrity critical...', 'I miscalculated. Adjusting.'],
      death: ['Systems... failing...', 'Halo is out. Finish the equation.'],
      healed: ['Thank you. Recalibrating.'],
      allyDown: ['We lost one. Do not waste it.', 'Recompute. Keep moving.'],
      overtime: ['Hull decay accelerating. End it.'],
      victory: ['Result confirmed. We win.', 'A clean solution.'],
    },
  },
  salvo: {
    pilot: 'Tomo Akagi',
    callsign: 'BOOM',
    portrait: { id: 'tomo', skin: '#f6d6b8', hair: '#3ccf6a', hairStyle: 'bob', eyes: '#2fa0ff', suit: '#143322', accent: '#52ff8a', bg: '#1a5a32', headset: true, blush: true },
    lines: {
      start: ['Missile racks are loaded! Ooh, this is gonna be loud!', 'Boom online!'],
      signature: ['Missiles away!', 'Fox three, fox three!'],
      kill: ['Boom! Ahaha!', 'Splash one!', 'Did you see that explosion?!'],
      lowHp: ["Eek! That's way too close!", 'Hull breach! Hull breach!'],
      death: ['Boom is going down! Waaah!', 'Out of missiles... out of luck...'],
      healed: ['Thanks, Juno! You are the best!'],
      allyDown: ["No! I'll cover you with everything I've got!"],
      overtime: ['Everything is overheating!'],
      victory: ['We did it! So many explosions!', 'Mission complete! Can we do that again?'],
    },
  },
  mender: {
    pilot: 'Juno Ashgrove',
    callsign: 'LULLABY',
    portrait: { id: 'juno', skin: '#efcfb2', hair: '#5fe0c8', hairStyle: 'ponytail', eyes: '#3fb08f', suit: '#1a3a3a', accent: '#7dffd8', bg: '#1a5a54', blush: true },
    lines: {
      start: ['Lullaby here. I will keep you all flying.', 'Repair field ready. Be careful out there.'],
      signature: ['Hold still, patching you up.', 'Repair beam on you.'],
      kill: ['Oh! I got one?'],
      lowHp: ['I could use some help over here!', "I can't fix myself, you know!"],
      death: ["I'm sorry... I can't keep you up anymore...", 'Lullaby is down!'],
      allyDown: ["I couldn't reach them in time...", 'No... stay with me!'],
      overtime: ["I can't heal this fast enough!"],
      victory: ['Everyone made it... mostly. Thank goodness.', 'Battle over. Let me look at those dents.'],
    },
  },

  // ---- Enemy faction (placeholder) ----
  drone: {
    pilot: 'Swarm Node',
    callsign: 'NODE',
    portrait: { id: 'node', helmet: true, suit: '#3a1020', accent: '#ff4fa3', bg: '#4a0f2a' },
    lines: {
      start: ['HOSTILES DETECTED. ENGAGING.'],
      kill: ['TARGET NEUTRALIZED.', 'THREAT REMOVED.'],
      victory: ['SECTOR PURGED.'],
    },
  },
  brute: {
    pilot: 'Gorran',
    callsign: 'MAUL',
    portrait: { id: 'gorran', skin: '#c99a7a', hair: '#3a2a2a', hairStyle: 'short', eyes: '#ff5a3c', suit: '#4a1a10', accent: '#ff5a3c', bg: '#5a1a10', scar: true },
    lines: {
      start: ["I'll crush your little ships one by one.", 'Fresh scrap. Come closer.'],
      kill: ['Ha! Scrap!', 'Who is next?'],
      lowHp: ['You... you dare?!'],
      death: ['Impossible...!'],
      victory: ['Your squad is finished.', 'Drag what is left back to their masters.'],
    },
  },
  gunship: {
    pilot: 'Vex',
    callsign: 'VEX',
    portrait: { id: 'vex', skin: '#e9c4a8', hair: '#ff6a2a', hairStyle: 'bob', eyes: '#ff8a2a', suit: '#3a1a0a', accent: '#ff8a2a', bg: '#5a2a0a', mask: 'visor' },
    lines: {
      start: ["You're in my sights.", 'Gunship wing, weapons free.'],
      kill: ['Splash one.', 'Too easy.'],
      death: ['Tch... pulling out!'],
      victory: ['Pathetic. Mark them as eliminated.'],
    },
  },
  bomber: {
    pilot: 'Mortis',
    callsign: 'MORTIS',
    portrait: { id: 'mortis', skin: '#e2d4d8', hair: '#e8e8f0', hairStyle: 'long', eyes: '#ff3b5c', suit: '#2a0a14', accent: '#ff3b5c', bg: '#4a0a1e' },
    lines: {
      start: ['Incoming. Pray.', 'Ordnance armed. Scatter, little ships.'],
      kill: ['Direct hit.', 'Nothing left.'],
      death: ['So this is... the end...'],
      victory: ['Silence. At last.'],
    },
  },
});
