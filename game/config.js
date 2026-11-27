// Generated from game_config.yaml. Don't edit this file. Edit game_config.yaml, then run `npm run config` (npm start does it for you).
window.MOO_CONFIG = {
  "start": {
    "coins": 0,
    "cows": 1
  },
  "herd": {
    "max_cows": 20,
    "new_cow_price": 15,
    "rest_seconds": 30
  },
  "cows": {
    "base": {
      "name": "Base cow",
      "milk": "Milk",
      "milk_price": 5
    },
    "chocolate": {
      "name": "Chocolate cow",
      "milk": "Chocolate milk",
      "milk_price": 15
    },
    "strawberry": {
      "name": "Strawberry cow",
      "milk": "Strawberry milk",
      "milk_price": 30
    },
    "doughnut": {
      "name": "Doughnut cow",
      "milk": "Coffee",
      "milk_price": 65
    },
    "almond": {
      "name": "Almond cow",
      "milk": "Almond milk",
      "milk_price": 150
    },
    "eggnog": {
      "name": "Eggnog cow",
      "milk": "Eggnog",
      "milk_price": 325
    },
    "skeleton": {
      "name": "Skeleton cow",
      "milk": "Skim milk",
      "milk_price": 700
    }
  },
  "upgrade_items": {
    "chocolateBar": {
      "name": "Chocolate bar",
      "icon": "🍫",
      "turns": "base",
      "into": "chocolate",
      "cost": 20
    },
    "strawberry": {
      "name": "Strawberry",
      "icon": "🍓",
      "turns": "chocolate",
      "into": "strawberry",
      "cost": 50
    },
    "latteCup": {
      "name": "Latte cup",
      "icon": "☕",
      "turns": "strawberry",
      "into": "doughnut",
      "cost": 75
    },
    "almond": {
      "name": "Almond",
      "icon": "🌰",
      "turns": "doughnut",
      "into": "almond",
      "cost": 120
    },
    "festiveSpice": {
      "name": "Festive spice",
      "icon": "🎄",
      "turns": "almond",
      "into": "eggnog",
      "cost": 300
    },
    "boneBiscuit": {
      "name": "Bone biscuit",
      "icon": "🦴",
      "turns": "eggnog",
      "into": "skeleton",
      "cost": 650
    }
  },
  "ship_upgrades": {
    "milkTime": {
      "name": "Milking time",
      "description": "The milker works faster each level.",
      "unit": "s",
      "start": 15,
      "change": "add",
      "amount": -3,
      "round": "whole",
      "min": 1,
      "cost": 5,
      "cost_multiplier": 1.3,
      "max_level": 4
    },
    "cowCap": {
      "name": "Ship cow capacity",
      "description": "Room for more cows aboard.",
      "unit": "cows",
      "start": 3,
      "change": "add",
      "amount": 1,
      "round": "whole",
      "cost": 20,
      "cost_multiplier": 1.5,
      "max_level": 7
    },
    "bottleCap": {
      "name": "Ship bottle capacity",
      "description": "Store more bottles of milk.",
      "unit": "bottles",
      "start": 5,
      "change": "multiply",
      "amount": 1.5,
      "round": "whole",
      "cost": 10,
      "cost_multiplier": 1.3,
      "max_level": 8
    },
    "stealth": {
      "name": "Ship stealth",
      "description": "Each beam raises Earth's suspicion less.",
      "unit": "",
      "start": 10,
      "change": "multiply",
      "amount": 1.5,
      "round": "tenth",
      "cost": 20,
      "cost_multiplier": 1.8,
      "max_level": 6
    }
  },
  "suspicion": {
    "per_beam": 250,
    "limit": 100,
    "cooldown_per_second": 1.5,
    "when_full": "caught"
  },
  "goal": {
    "coins": 5000
  },
  "milker": {
    "wear_per_milking": 10,
    "slow_below": 50,
    "slow_multiplier": 2,
    "break_chance": 0.05,
    "worn_break_chance": 0.2,
    "repair_cost": 15,
    "repair_seconds": 20,
    "free_repair_seconds": 60
  },
  "time": {
    "offline_hours": 4
  }
};
