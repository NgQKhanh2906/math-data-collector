/**
 * Bộ sinh biểu thức toán học chuẩn ASCII làm Ground Truth cho thu thập dữ liệu viết tay.
 */
(function (globalScope) {
  'use strict';

  var HISTORY_LIMIT = 20;
  var recentPrompts = [];

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
    var c;

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

  function generateByCategory(category) {
    var resolved = category === 'mixed' ? chooseMixedCategory() : category;
    if (resolved === 'brackets') {
      return buildBracketsPrompt();
    }
    if (resolved === 'algebra') {
      return buildAlgebraPrompt();
    }
    return buildBasicPrompt();
  }

  function generate(category) {
    var targetCategory = category || 'mixed';
    var candidate = '';
    var attempts = 0;

    while (attempts < 25) {
      candidate = generateByCategory(targetCategory);
      if (recentPrompts.indexOf(candidate) === -1) {
        break;
      }
      attempts += 1;
    }

    recentPrompts.push(candidate);
    if (recentPrompts.length > HISTORY_LIMIT) {
      recentPrompts.shift();
    }

    return candidate;
  }

  globalScope.MathPromptGenerator = Object.freeze({
    generate: generate
  });
})(typeof window !== 'undefined' ? window : globalThis);
