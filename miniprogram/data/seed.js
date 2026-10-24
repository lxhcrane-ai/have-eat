// 演示数据：由 scripts/gen-seed.js 生成（14 天，截至 2026-10-25）。
// 仅在本机无记录时导入一次；真实使用前把它改回 [] 或清空本机数据。
// 重新生成：node scripts/gen-seed.js 2026-10-25
module.exports = [
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-12",
    "date": "2026-10-12",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.6,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.5,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.8,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 6.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "technique",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 4,
      "back": 1,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-12T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-13",
    "date": "2026-10-13",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.5,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.4,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.7,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.3,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "strength",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-13T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-14",
    "date": "2026-10-14",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.5,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.4,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.7,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "sparring",
      "durationMin": 90,
      "rpe": 8,
      "rounds": 8,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-14T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-15",
    "date": "2026-10-15",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.4,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.3,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.6,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 6.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "cardio",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-15T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-16",
    "date": "2026-10-16",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.3,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.2,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.5,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.3,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "technique",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 4,
      "back": 1,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-16T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-17",
    "date": "2026-10-17",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.3,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.2,
        "context": "pre_train"
      },
      "post": {
        "kg": 59.4,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 5.6,
      "quality": 2
    },
    "hydration": {
      "waterMl": 900,
      "urineColor": 6
    },
    "restingHr": 66,
    "training": {
      "sessionType": "recovery",
      "durationMin": 40,
      "rpe": 3,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 8,
      "back": 5,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 4,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 60,
            "kcal": 227,
            "protein": 7.8,
            "carbs": 39.6,
            "fat": 4.1
          },
          {
            "name": "牛奶",
            "grams": 200,
            "kcal": 130,
            "protein": 6.6,
            "carbs": 9.8,
            "fat": 7.2
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "13:00",
        "items": [
          {
            "name": "米饭",
            "grams": 150,
            "kcal": 174,
            "protein": 3.9,
            "carbs": 38.9,
            "fat": 0.5
          },
          {
            "name": "鸡胸肉",
            "grams": 100,
            "kcal": 165,
            "protein": 31,
            "carbs": 0,
            "fat": 3.6
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:40",
        "items": [
          {
            "name": "米饭",
            "grams": 150,
            "kcal": 174,
            "protein": 3.9,
            "carbs": 38.9,
            "fat": 0.5
          },
          {
            "name": "蔬菜",
            "grams": 200,
            "kcal": 68,
            "protein": 5.8,
            "carbs": 14,
            "fat": 0.8
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "speed",
      "note": "出拳速度强化"
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-17T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-18",
    "date": "2026-10-18",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.2,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61.1,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.4,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 6.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "technique",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-18T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-19",
    "date": "2026-10-19",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60.1,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 61,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.3,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.3,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "strength",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-19T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-20",
    "date": "2026-10-20",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 60.9,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.2,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "sparring",
      "durationMin": 90,
      "rpe": 8,
      "rounds": 8,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 4,
      "back": 1,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-20T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-21",
    "date": "2026-10-21",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 60,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 60.9,
        "context": "pre_train"
      },
      "post": {
        "kg": 59.1,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 5.6,
      "quality": 2
    },
    "hydration": {
      "waterMl": 900,
      "urineColor": 6
    },
    "restingHr": 66,
    "training": {
      "sessionType": "cardio",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 4,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 60,
            "kcal": 227,
            "protein": 7.8,
            "carbs": 39.6,
            "fat": 4.1
          },
          {
            "name": "牛奶",
            "grams": 200,
            "kcal": 130,
            "protein": 6.6,
            "carbs": 9.8,
            "fat": 7.2
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "13:00",
        "items": [
          {
            "name": "米饭",
            "grams": 150,
            "kcal": 174,
            "protein": 3.9,
            "carbs": 38.9,
            "fat": 0.5
          },
          {
            "name": "鸡胸肉",
            "grams": 100,
            "kcal": 165,
            "protein": 31,
            "carbs": 0,
            "fat": 3.6
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:40",
        "items": [
          {
            "name": "米饭",
            "grams": 150,
            "kcal": 174,
            "protein": 3.9,
            "carbs": 38.9,
            "fat": 0.5
          },
          {
            "name": "蔬菜",
            "grams": 200,
            "kcal": 68,
            "protein": 5.8,
            "carbs": 14,
            "fat": 0.8
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-21T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-22",
    "date": "2026-10-22",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 59.9,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 60.8,
        "context": "pre_train"
      },
      "post": {
        "kg": 60.1,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.3,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "technique",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-22T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-23",
    "date": "2026-10-23",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 59.8,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 60.7,
        "context": "pre_train"
      },
      "post": {
        "kg": 60,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "recovery",
      "durationMin": 40,
      "rpe": 3,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-23T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-24",
    "date": "2026-10-24",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 59.8,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 60.7,
        "context": "pre_train"
      },
      "post": {
        "kg": 60,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 6.8,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "technique",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 4,
      "back": 1,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-24T12:00:00.000Z"
  },
  {
    "schemaVersion": 2,
    "id": "seed-2026-10-25",
    "date": "2026-10-25",
    "tzOffset": 480,
    "weights": {
      "morning": {
        "kg": 59.7,
        "context": "morning_fasted"
      },
      "pre": {
        "kg": 60.6,
        "context": "pre_train"
      },
      "post": {
        "kg": 59.9,
        "context": "post_train"
      }
    },
    "sleep": {
      "hours": 7.3,
      "quality": 4
    },
    "hydration": {
      "waterMl": 2000,
      "urineColor": 3
    },
    "restingHr": 58,
    "training": {
      "sessionType": "strength",
      "durationMin": 70,
      "rpe": 6,
      "rounds": null,
      "content": ""
    },
    "sorenessByArea": {
      "shoulder": 2,
      "back": 0,
      "arm": 2,
      "leg": 1,
      "core": 1
    },
    "mood": {
      "fatigue": 2,
      "stress": 2,
      "appetite": 2
    },
    "meals": [
      {
        "slot": "breakfast",
        "time": "08:10",
        "items": [
          {
            "name": "燕麦片",
            "grams": 80,
            "kcal": 302,
            "protein": 10.4,
            "carbs": 52.8,
            "fat": 5.4
          },
          {
            "name": "牛奶",
            "grams": 250,
            "kcal": 163,
            "protein": 8.3,
            "carbs": 12.3,
            "fat": 9
          },
          {
            "name": "鸡蛋",
            "grams": 100,
            "kcal": 143,
            "protein": 12.6,
            "carbs": 1.1,
            "fat": 9.5
          }
        ]
      },
      {
        "slot": "lunch",
        "time": "12:40",
        "items": [
          {
            "name": "米饭",
            "grams": 250,
            "kcal": 290,
            "protein": 6.5,
            "carbs": 64.8,
            "fat": 0.8
          },
          {
            "name": "鸡胸肉",
            "grams": 220,
            "kcal": 363,
            "protein": 68.2,
            "carbs": 0,
            "fat": 7.9
          },
          {
            "name": "西兰花",
            "grams": 200,
            "kcal": 68,
            "protein": 5.6,
            "carbs": 8.6,
            "fat": 1.2
          }
        ]
      },
      {
        "slot": "dinner",
        "time": "19:10",
        "items": [
          {
            "name": "米饭",
            "grams": 200,
            "kcal": 232,
            "protein": 5.2,
            "carbs": 51.8,
            "fat": 0.6
          },
          {
            "name": "鱼",
            "grams": 180,
            "kcal": 190,
            "protein": 33.5,
            "carbs": 0,
            "fat": 6.1
          },
          {
            "name": "蔬菜",
            "grams": 250,
            "kcal": 85,
            "protein": 7.2,
            "carbs": 17.5,
            "fat": 1
          },
          {
            "name": "乳清蛋白",
            "grams": 30,
            "kcal": 113,
            "protein": 24,
            "carbs": 3,
            "fat": 1.2
          }
        ]
      }
    ],
    "nextPlan": {
      "type": "technique",
      "note": ""
    },
    "goal": {
      "phase": "cut",
      "targetWeightKg": 57,
      "weighInDate": "2026-11-29"
    },
    "createdAt": "2026-10-25T12:00:00.000Z"
  }
];
