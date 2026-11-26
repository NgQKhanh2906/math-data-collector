/**
 * Bộ sinh biểu thức toán học chuẩn ASCII làm Ground Truth cho thu thập dữ liệu viết tay.
 * Hỗ trợ chế độ đề tổng hợp và phân khu chuyên biệt cho 4 kiểu dữ liệu còn thiếu.
 */
(function (globalScope) {
  'use strict';

  var HISTORY_LIMIT = 20;
  var recentPrompts = [];
  var DEFICIT_KEYS = ['div_colon', 'mul_implicit', 'pow_caret', 'mul_dot'];
  var MIDDLE_DOT = '\u00B7';

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(items) {
    return items[randInt(0, items.length - 1)];
  }

  function formatDecimal(intVal, fracVal) {
    var trimmed = String(fracVal).replace(/0+$/, '');
    if (!trimmed) {
      return String(intVal);
    }
    return intVal + '.' + trimmed;
  }

  function generateDecimalOperand(maxInt) {
    var intPart = randInt(1, maxInt);
    var fracChoices = ['5', '25', '75', '2', '4', '6', '8', '15', '35'];
    return formatDecimal(intPart, pick(fracChoices));
  }

  function buildBasicPrompt() {
    var pattern = randInt(1, 5);
    var a;
    var b;
    var c;
    var op1;
    var op2;

    if (pattern === 1) {
      a = randInt(10, 999);
      b = randInt(10, 999);
      op1 = pick(['+', '-']);
      if (op1 === '-' && a < b) {
        var temp = a;
        a = b;
        b = temp;
      }
      return a + ' ' + op1 + ' ' + b;
    }

    if (pattern === 2) {
      a = randInt(2, 95);
      b = randInt(2, 19);
      return a + ' * ' + b;
    }

    if (pattern === 3) {
      var divisor = randInt(2, 18);
      var quotient = randInt(2, 35);
      var dividend = divisor * quotient;
      return dividend + ' / ' + divisor;
    }

    if (pattern === 4) {
      a = generateDecimalOperand(40);
      b = generateDecimalOperand(25);
      op1 = pick(['+', '-', '*']);
      return a + ' ' + op1 + ' ' + b;
    }

    a = randInt(10, 99);
    b = randInt(5, 65);
    c = randInt(2, 30);
    op1 = pick(['+', '-']);
    op2 = pick(['+', '-', '*']);
    return a + ' ' + op1 + ' ' + b + ' ' + op2 + ' ' + c;
  }

  function buildBracketsPrompt() {
    var pattern = randInt(1, 4);
    var a;
    var b;
    var c;
    var d;

    if (pattern === 1) {
      a = randInt(5, 45);
      b = randInt(3, 35);
      c = randInt(2, 12);
      var innerOp = pick(['+', '-']);
      if (innerOp === '-' && a <= b) {
        a = b + randInt(3, 25);
      }
      var outerOp = pick(['*', '+']);
      return '(' + a + ' ' + innerOp + ' ' + b + ') ' + outerOp + ' ' + c;
    }

    if (pattern === 2) {
      var divisor = randInt(2, 12);
      var factor = randInt(2, 15);
      var dividend = divisor * factor;
      var x = randInt(divisor + 2, divisor + 18);
      var y = x - divisor;
      return dividend + ' / (' + x + ' - ' + y + ')';
    }

    if (pattern === 3) {
      a = randInt(10, 60);
      b = randInt(2, 20);
      c = randInt(2, 9);
      d = randInt(2, 12);
      if (a <= b) {
        a = b + randInt(5, 30);
      }
      return '(' + a + ' - ' + b + ') + ' + c + ' * ' + d;
    }

    a = randInt(2, 20);
    b = randInt(2, 20);
    c = randInt(10, 35);
    d = randInt(2, 9);
    if (c <= d) {
      c = d + randInt(2, 15);
    }
    return '(' + a + ' + ' + b + ') * (' + c + ' - ' + d + ')';
  }

  function buildAlgebraPrompt() {
    var pattern = randInt(1, 6);
    var variable = pick(['x', 'y']);
    var a;
    var b;

    if (pattern === 1) {
      a = randInt(2, 12);
      var xVal = randInt(1, 15);
      b = randInt(1, 25);
      var op = pick(['+', '-']);
      var rhs = op === '+' ? a * xVal + b : a * xVal - b;
      return a + variable + ' ' + op + ' ' + b + ' = ' + rhs;
    }

    if (pattern === 2) {
      a = randInt(2, 12);
      b = randInt(2, 9);
      var expA = randInt(2, 3);
      var expB = randInt(2, 3);
      var joinOp = pick(['+', '-']);
      return a + '^' + expA + ' ' + joinOp + ' ' + b + '^' + expB;
    }

    if (pattern === 3) {
      var root = randInt(2, 12);
      var square = root * root;
      var coeff = randInt(1, 4);
      var sign = pick(['-', '+']);
      if (coeff === 1) {
        return variable + '^2 ' + sign + ' ' + square + ' = 0';
      }
      return coeff + variable + '^2 ' + sign + ' ' + square + ' = 0';
    }

    if (pattern === 4) {
      var n = randInt(2, 15);
      var extra = randInt(1, 20);
      var opSq = pick(['+', '-', '*']);
      return 'sqrt(' + (n * n) + ') ' + opSq + ' ' + extra;
    }

    if (pattern === 5) {
      var den1 = randInt(2, 9);
      var num1 = randInt(1, den1 - 1);
      var den2 = randInt(2, 9);
      var num2 = randInt(1, den2 - 1);
      var fracOp = pick(['+', '-', '*']);
      return num1 + '/' + den1 + ' ' + fracOp + ' ' + num2 + '/' + den2;
    }

    a = randInt(2, 9);
    b = randInt(1, 12);
    var xSol = randInt(1, 8);
    return a + '(' + variable + ' + ' + b + ') = ' + (a * (b + xSol));
  }

  function buildDivColonPrompt() {
    var pattern = randInt(1, 7);
    var divisor = randInt(2, 19);
    var quotient = randInt(2, 35);
    var dividend = divisor * quotient;
    var display = '';

    if (pattern === 1) {
      display = dividend + ' : ' + divisor;
    } else if (pattern === 2) {
      display = dividend + ' : ' + divisor + ' + ' + randInt(3, 45);
    } else if (pattern === 3) {
      var left = quotient + randInt(5, 50);
      display = left + ' - ' + dividend + ' : ' + divisor;
    } else if (pattern === 4) {
      var c = randInt(2, 12);
      var targetSum = c * randInt(3, 18);
      var partA = randInt(2, targetSum - 2);
      var partB = targetSum - partA;
      display = '(' + partA + ' + ' + partB + ') : ' + c;
    } else if (pattern === 5) {
      var d = randInt(2, 12);
      var num = d * randInt(2, 15);
      var subY = randInt(2, 16);
      var subX = subY + d;
      display = num + ' : (' + subX + ' - ' + subY + ')';
    } else if (pattern === 6) {
      var divC = randInt(2, 8);
      var divB = randInt(2, 9);
      var baseQ = randInt(2, 10);
      var topA = divC * divB * baseQ;
      display = topA + ' : ' + divB + ' : ' + divC;
    } else {
      var d1 = randInt(2, 11);
      var n1 = d1 * randInt(2, 14);
      var d2 = randInt(2, 11);
      var n2 = d2 * randInt(2, 14);
      display = '(' + n1 + ' : ' + d1 + ') + (' + n2 + ' : ' + d2 + ')';
    }

    return {
      display: display,
      canonical: display.replace(/:/g, '/'),
      styleTag: 'div_colon',
      highlightToken: ':',
      ruleHint: 'Viết rõ dấu hai chấm : (không viết dấu / hay gạch phân số).'
    };
  }

  function buildMulImplicitPrompt() {
    var pattern = randInt(1, 7);
    var a;
    var b;
    var c;
    var d;
    var display = '';
    var canonical = '';

    if (pattern === 1) {
      b = randInt(2, 24);
      a = b + randInt(3, 35);
      c = randInt(2, 9);
      display = '(' + a + ' - ' + b + ')' + c;
      canonical = '(' + a + ' - ' + b + ') * ' + c;
    } else if (pattern === 2) {
      a = randInt(3, 28);
      b = randInt(3, 28);
      c = randInt(2, 9);
      display = '(' + a + ' + ' + b + ')' + c;
      canonical = '(' + a + ' + ' + b + ') * ' + c;
    } else if (pattern === 3) {
      c = randInt(2, 9);
      a = randInt(3, 25);
      b = randInt(3, 25);
      display = c + '(' + a + ' + ' + b + ')';
      canonical = c + ' * (' + a + ' + ' + b + ')';
    } else if (pattern === 4) {
      c = randInt(2, 9);
      b = randInt(2, 19);
      a = b + randInt(3, 28);
      display = c + '(' + a + ' - ' + b + ')';
      canonical = c + ' * (' + a + ' - ' + b + ')';
    } else if (pattern === 5) {
      a = randInt(2, 18);
      b = randInt(2, 18);
      d = randInt(2, 14);
      c = d + randInt(2, 18);
      display = '(' + a + ' + ' + b + ')(' + c + ' - ' + d + ')';
      canonical = '(' + a + ' + ' + b + ') * (' + c + ' - ' + d + ')';
    } else if (pattern === 6) {
      c = randInt(2, 9);
      b = randInt(2, 15);
      a = b + randInt(3, 20);
      d = randInt(4, 30);
      display = c + '(' + a + ' - ' + b + ') + ' + d;
      canonical = c + ' * (' + a + ' - ' + b + ') + ' + d;
    } else {
      b = randInt(2, 15);
      a = b + randInt(3, 18);
      c = randInt(2, 7);
      d = (a - b) * c + randInt(5, 45);
      display = d + ' - (' + a + ' - ' + b + ')' + c;
      canonical = d + ' - (' + a + ' - ' + b + ') * ' + c;
    }

    return {
      display: display,
      canonical: canonical,
      styleTag: 'mul_implicit',
      highlightToken: 'implicit',
      ruleHint: 'Viết số sát dấu ngoặc, KHÔNG thêm dấu nhân ×, * hay dấu chấm ở giữa.'
    };
  }

  function buildPowCaretPrompt() {
    var pattern = randInt(1, 7);
    var a;
    var b;
    var c;
    var expA;
    var expB;
    var expr = '';

    if (pattern === 1) {
      a = randInt(2, 12);
      expA = randInt(2, 4);
      b = randInt(2, 35);
      expr = a + ' ^ ' + expA + ' + ' + b;
    } else if (pattern === 2) {
      a = randInt(3, 11);
      expA = randInt(2, 3);
      var maxSub = Math.max(2, Math.pow(a, expA) - 1);
      b = randInt(1, Math.min(40, maxSub));
      expr = a + ' ^ ' + expA + ' - ' + b;
    } else if (pattern === 3) {
      a = randInt(2, 9);
      b = randInt(2, 9);
      expA = randInt(2, 3);
      expB = randInt(2, 3);
      expr = a + ' ^ ' + expA + ' + ' + b + ' ^ ' + expB;
    } else if (pattern === 4) {
      a = randInt(2, 12);
      b = randInt(2, 12);
      expA = randInt(2, 3);
      expr = '(' + a + ' + ' + b + ') ^ ' + expA;
    } else if (pattern === 5) {
      b = randInt(2, 10);
      a = b + randInt(2, 12);
      expA = randInt(2, 3);
      expr = '(' + a + ' - ' + b + ') ^ ' + expA;
    } else if (pattern === 6) {
      a = randInt(2, 8);
      expA = randInt(2, 3);
      c = randInt(2, 9);
      expr = a + ' ^ ' + expA + ' * ' + c;
    } else {
      a = randInt(5, 15);
      b = randInt(2, a - 1);
      expr = a + ' ^ 2 - ' + b + ' ^ 2';
    }

    return {
      display: expr,
      canonical: expr,
      styleTag: 'pow_caret',
      highlightToken: '^',
      ruleHint: 'Bắt buộc viết rõ dấu mũ nhọn ^ ngang hàng (KHÔNG viết số mũ nhỏ ở góc trên).'
    };
  }

  function buildMulDotPrompt() {
    var pattern = randInt(1, 7);
    var a;
    var b;
    var c;
    var d;
    var display = '';

    if (pattern === 1) {
      a = randInt(2, 48);
      b = randInt(2, 19);
      display = a + ' ' + MIDDLE_DOT + ' ' + b;
    } else if (pattern === 2) {
      a = randInt(2, 25);
      b = randInt(2, 14);
      c = randInt(3, 45);
      display = a + ' ' + MIDDLE_DOT + ' ' + b + ' + ' + c;
    } else if (pattern === 3) {
      a = randInt(2, 14);
      b = randInt(2, 12);
      c = a * b + randInt(4, 40);
      display = c + ' - ' + a + ' ' + MIDDLE_DOT + ' ' + b;
    } else if (pattern === 4) {
      a = randInt(2, 15);
      b = randInt(2, 18);
      c = randInt(2, 18);
      display = a + ' ' + MIDDLE_DOT + ' (' + b + ' + ' + c + ')';
    } else if (pattern === 5) {
      b = randInt(2, 15);
      a = b + randInt(3, 24);
      c = randInt(2, 15);
      display = '(' + a + ' - ' + b + ') ' + MIDDLE_DOT + ' ' + c;
    } else if (pattern === 6) {
      a = randInt(2, 12);
      b = randInt(2, 12);
      c = randInt(2, 12);
      display = a + ' ' + MIDDLE_DOT + ' ' + b + ' ' + MIDDLE_DOT + ' ' + c;
    } else {
      a = randInt(2, 12);
      b = randInt(2, 12);
      c = randInt(2, 12);
      d = randInt(2, 12);
      display = a + ' ' + MIDDLE_DOT + ' ' + b + ' + ' + c + ' ' + MIDDLE_DOT + ' ' + d;
    }

    return {
      display: display,
      canonical: display.split(MIDDLE_DOT).join('*'),
      styleTag: 'mul_dot',
      highlightToken: MIDDLE_DOT,
      ruleHint: 'Viết dấu chấm nhân ở giữa dòng (·), KHÔNG viết dấu × hay dấu *.'
    };
  }

  function chooseWeightedDeficitType(totalCounts, targetsConfig) {
    var weights = [];
    var totalWeight = 0;

    for (var i = 0; i < DEFICIT_KEYS.length; i += 1) {
      var key = DEFICIT_KEYS[i];
      var cfg = targetsConfig && targetsConfig[key] ? targetsConfig[key] : {};
      var target = Number(cfg.target) || 40;
      var base = Number(cfg.baseCount) || 0;
      var current =
        totalCounts && typeof totalCounts[key] === 'number' ? totalCounts[key] : base;
      var remaining = Math.max(1, target - current);
      var weight = remaining * (current < 10 ? 2 : 1);

      weights.push({ key: key, weight: weight });
      totalWeight += weight;
    }

    var threshold = Math.random() * totalWeight;
    var cumulative = 0;
    for (var j = 0; j < weights.length; j += 1) {
      cumulative += weights[j].weight;
      if (threshold <= cumulative) {
        return weights[j].key;
      }
    }

    return DEFICIT_KEYS[0];
  }

  function buildDeficitItem(resolvedKey) {
    if (resolvedKey === 'mul_implicit') {
      return buildMulImplicitPrompt();
    }
    if (resolvedKey === 'pow_caret') {
      return buildPowCaretPrompt();
    }
    if (resolvedKey === 'mul_dot') {
      return buildMulDotPrompt();
    }
    return buildDivColonPrompt();
  }

  function chooseMixedCategory() {
    var roll = Math.random();
    if (roll < 0.5) {
      return 'basic';
    }
    if (roll < 0.8) {
      return 'brackets';
    }
    return 'algebra';
  }

  function buildGeneralItem(category) {
    var resolved = category === 'mixed' ? chooseMixedCategory() : category;
    var expr = '';
    if (resolved === 'brackets') {
      expr = buildBracketsPrompt();
    } else if (resolved === 'algebra') {
      expr = buildAlgebraPrompt();
    } else {
      resolved = 'basic';
      expr = buildBasicPrompt();
    }

    return {
      display: expr,
      canonical: expr,
      styleTag: 'general_' + resolved,
      highlightToken: '',
      ruleHint: ''
    };
  }

  function rememberAndReturn(item) {
    recentPrompts.push(item.display);
    if (recentPrompts.length > HISTORY_LIMIT) {
      recentPrompts.shift();
    }
    return item;
  }

  function generateDeficit(filterType, totalCounts, targetsConfig) {
    var mode = filterType || 'auto';
    var candidate = null;
    var attempts = 0;

    while (attempts < 25) {
      var targetKey =
        mode === 'auto' ? chooseWeightedDeficitType(totalCounts, targetsConfig) : mode;
      candidate = buildDeficitItem(targetKey);
      if (recentPrompts.indexOf(candidate.display) === -1) {
        break;
      }
      attempts += 1;
    }

    return rememberAndReturn(candidate);
  }

  function generateGeneral(category) {
    var targetCategory = category || 'mixed';
    var candidate = null;
    var attempts = 0;

    while (attempts < 25) {
      candidate = buildGeneralItem(targetCategory);
      if (recentPrompts.indexOf(candidate.display) === -1) {
        break;
      }
      attempts += 1;
    }

    return rememberAndReturn(candidate);
  }

  function generate(category) {
    return generateGeneral(category).display;
  }

  globalScope.MathPromptGenerator = Object.freeze({
    generate: generate,
    generateGeneral: generateGeneral,
    generateDeficit: generateDeficit
  });
})(typeof window !== 'undefined' ? window : globalThis);
