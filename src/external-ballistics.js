/* JavaScript port of the GNU Ballistics Library, distributed under GPL-2.0.
 * Numerical integration, validation and sampling revised 2026-10-21.
 * Drag coefficients retain the original GNU Ballistics values and attribution.
 */
(function (root, factory) {
    'use strict';
    var Constructor = factory();
    if (typeof module === 'object' && module.exports) module.exports = Constructor;
    root.ExternalBallistics = Constructor;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

function ExternalBallistics() {
    this.BCOMP_MAXRANGE = 50001; // maximum number of legacy one-yard records (including the muzzle)
    this.DEFAULT_GRAVITY = -32.174; // gravity in ft/s²
    this.DEFAULT_YINTERCEPT = 0; // y-height of the projectile when it crosses the zero range (inches) - could also be set as a variable
    this.DRAG_FUNCTIONS = {
        'G1': {
            'thresholds': [4230, 3680, 3450, 3295, 3130, 2960, 2830, 2680, 2460, 2225, 2015, 1890, 1810, 1730, 1595,
                           1520, 1420, 1360, 1315, 1280, 1220, 1185, 1150, 1100, 1060, 1025, 980, 945, 905, 860, 810,
                           780, 750, 700, 640, 600, 550, 250, 100, 65, 0],
            'values': [
                {'A':1.477404177730177e-04, 'M':1.9565},
                {'A':1.920339268755614e-04, 'M':1.925},
                {'A':2.894751026819746e-04, 'M':1.875},
                {'A':4.349905111115636e-04, 'M':1.825},
                {'A':6.520421871892662e-04, 'M':1.775},
                {'A':9.748073694078696e-04, 'M':1.725},
                {'A':1.453721560187286e-03, 'M':1.675},
                {'A':2.162887202930376e-03, 'M':1.625},
                {'A':3.209559783129881e-03, 'M':1.575},
                {'A':3.904368218691249e-03, 'M':1.55},
                {'A':3.222942271262336e-03, 'M':1.575},
                {'A':2.203329542297809e-03, 'M':1.625},
                {'A':1.511001028891904e-03, 'M':1.675},
                {'A':8.609957592468259e-04, 'M':1.75},
                {'A':4.086146797305117e-04, 'M':1.85},
                {'A':1.954473210037398e-04, 'M':1.95},
                {'A':5.431896266462351e-05, 'M':2.125},
                {'A':8.847742581674416e-06, 'M':2.375},
                {'A':1.456922328720298e-06, 'M':2.625},
                {'A':2.419485191895565e-07, 'M':2.875},
                {'A':1.657956321067612e-08, 'M':3.25},
                {'A':4.745469537157371e-10, 'M':3.75},
                {'A':1.379746590025088e-11, 'M':4.25},
                {'A':4.070157961147882e-13, 'M':4.75},
                {'A':2.938236954847331e-14, 'M':5.125},
                {'A':1.228597370774746e-14, 'M':5.25},
                {'A':2.916938264100495e-14, 'M':5.125},
                {'A':3.855099424807451e-13, 'M':4.75},
                {'A':1.185097045689854e-11, 'M':4.25},
                {'A':3.566129470974951e-10, 'M':3.75},
                {'A':1.045513263966272e-08, 'M':3.25},
                {'A':1.291159200846216e-07, 'M':2.875},
                {'A':6.824429329105383e-07, 'M':2.625},
                {'A':3.569169672385163e-06, 'M':2.375},
                {'A':1.839015095899579e-05, 'M':2.125},
                {'A':5.71117468873424e-05 , 'M':1.950},
                {'A':9.226557091973427e-05, 'M':1.875},
                {'A':9.337991957131389e-05, 'M':1.875},
                {'A':7.225247327590413e-05, 'M':1.925},
                {'A':5.792684957074546e-05, 'M':1.975},
                {'A':5.206214107320588e-05, 'M':2.000}
            ]
       },
       'G2': {
            'thresholds': [1674, 1172, 1060, 949, 670, 335, 0],
            'values': [
                {'A':0.0079470052136733, 'M':1.36999902851493},
                {'A':1.00419763721974e-03, 'M':1.65392237010294},
                {'A':7.15571228255369e-23, 'M':7.91913562392361},
                {'A':1.39589807205091e-10, 'M':3.81439537623717},
                {'A':2.34364342818625e-04, 'M':1.71869536324748},
                {'A':1.77962438921838e-04, 'M':1.76877550388679},
                {'A':5.18033561289704e-05, 'M':1.98160270524632}
            ]
       },
       'G5': {
            'thresholds': [1730, 1228, 1116, 1004, 837, 335, 0],
            'values': [
                {'A':7.24854775171929e-03, 'M':1.41538574492812},
                {'A':3.50563361516117e-05, 'M':2.13077307854948},
                {'A':1.84029481181151e-13, 'M':4.81927320350395},
                {'A':1.34713064017409e-22, 'M':7.8100555281422},
                {'A':1.03965974081168e-07, 'M':2.84204791809926},
                {'A':1.09301593869823e-04, 'M':1.81096361579504},
                {'A':3.51963178524273e-05, 'M':2.00477856801111}
            ]
       },
       'G6': {
            'thresholds': [3236, 2065, 1311, 1144, 1004, 670, 0],
            'values': [
                {'A':0.0455384883480781, 'M':1.15997674041274},
                {'A':7.167261849653769e-02, 'M':1.10704436538885},
                {'A':1.66676386084348e-03, 'M':1.60085100195952},
                {'A':1.01482730119215e-07, 'M':2.9569674731838},
                {'A':4.31542773103552e-18, 'M':6.34106317069757},
                {'A':2.04835650496866e-05, 'M':2.11688446325998},
                {'A':7.50912466084823e-05, 'M':1.92031057847052}
            ]
       },
       'G7': {
            'thresholds': [4200, 3000, 1470, 1260, 1110, 960, 670, 540, 0],
            'values': [
                {'A':1.29081656775919e-09, 'M':3.24121295355962},
                {'A':0.0171422231434847, 'M':1.27907168025204},
                {'A':2.33355948302505e-03, 'M':1.52693913274526},
                {'A':7.97592111627665e-04, 'M':1.67688974440324},
                {'A':5.71086414289273e-12, 'M':4.3212826264889},
                {'A':3.02865108244904e-17, 'M':5.99074203776707},
                {'A':7.52285155782535e-06, 'M':2.1738019851075},
                {'A':1.31766281225189e-05, 'M':2.08774690257991},
                {'A':1.34504843776525e-05, 'M':2.08702306738884}
            ]
       },
       'G8': {
           'thresholds': [3571, 1841, 1120, 1088, 976, 0],
           'values': [
                {'A':0.0112263766252305, 'M':1.33207346655961},
                {'A':0.0167252613732636, 'M':1.28662041261785},
                {'A':2.20172456619625e-03, 'M':1.55636358091189},
                {'A':2.0538037167098e-16, 'M':5.80410776994789},
                {'A':5.92182174254121e-12, 'M':4.29275576134191},
                {'A':4.3917343795117e-05, 'M':1.99978116283334}
           ]
       }
   };
}


class BallisticsError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'BallisticsError';
        this.code = code;
    }
}

function finite(name, value, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new BallisticsError('INVALID_INPUT', name + ' must be a finite number between ' + min + ' and ' + max + '.');
    }
    return value;
}

ExternalBallistics.Error = BallisticsError;
ExternalBallistics.VERSION = '0.2.1';
ExternalBallistics.prototype.setVariables = function (v) {
    if (!v || !Object.prototype.hasOwnProperty.call(this.DRAG_FUNCTIONS, v.dragFunction)) {
        throw new BallisticsError('INVALID_INPUT', 'Choose a supported drag model: G1, G2, G5, G6, G7 or G8.');
    }
    this.dragFunction = v.dragFunction;
    this.dragCoefficient = finite('Ballistic coefficient', v.dragCoefficient, 0.001, 10);
    this.muzzleVelocity = finite('Muzzle velocity (ft/s)', v.muzzleVelocity, 1, 9999);
    this.sightHeight = finite('Sight height (in)', v.sightHeight, 0, 100);
    this.shootingAngle = finite('Shooting angle (degrees)', v.shootingAngle, -89, 89);
    this.windSpeed = finite('Wind speed (mph)', v.windSpeed, 0, 200);
    this.windAngle = finite('Wind direction (degrees)', v.windAngle, -3600, 3600);
    this.zeroRange = finite('Zero range (yards)', v.zeroRange, 0.01, 50000);
    this.gravity = this.DEFAULT_GRAVITY;
    this.yIntercept = finite('Zero intercept (in)', v.yIntercept ?? this.DEFAULT_YINTERCEPT, -100, 100);
    this.solution = [];
    this.maximumValidRange = 0;
    this.result = null;
};

ExternalBallistics.prototype.retard = function (velocity) {
    finite('Relative speed (ft/s)', velocity, Number.MIN_VALUE, 9999.999999);
    finite('Ballistic coefficient', this.dragCoefficient, 0.001, 10);
    var drag = this.DRAG_FUNCTIONS[this.dragFunction];
    if (!drag) throw new BallisticsError('INVALID_INPUT', 'Unsupported drag model.');
    for (var i = 0; i < drag.thresholds.length; i++) {
        if (velocity > drag.thresholds[i]) {
            return drag.values[i].A * Math.pow(velocity, drag.values[i].M) / this.dragCoefficient;
        }
    }
    throw new BallisticsError('MODEL_LIMIT', 'Speed is outside the drag model.');
};

ExternalBallistics.prototype.degToRad = function (value) { return value * Math.PI / 180; };
ExternalBallistics.prototype.radToDeg = function (value) { return value * 180 / Math.PI; };
ExternalBallistics.prototype.minuteOfAngleToRad = function (value) { return value * Math.PI / 10800; };
ExternalBallistics.prototype.radToMinuteOfAngle = function (value) { return value * 10800 / Math.PI; };
ExternalBallistics.prototype.getHeadWind = function (speedMph, angleDegrees) {
    return speedMph * Math.cos(this.degToRad(angleDegrees));
};
ExternalBallistics.prototype.getCrossWind = function (speedMph, angleDegrees) {
    return speedMph * Math.sin(this.degToRad(angleDegrees));
};
ExternalBallistics.prototype.getWindageDeflection = function (speedMph, velocityFps, rangeFeet, seconds) {
    return speedMph * 17.6 * (seconds - rangeFeet / velocityFps);
};

// Distance-based RK4: all state components are evaluated at the same x (feet).
// Coordinates follow the line of sight, so gravity depends on sight inclination,
// not the bore's additional elevation. Windage retains the GNU lag approximation.
ExternalBallistics.prototype.integrate = function (angleDegrees, options) {
    options = options || {};
    if (!this.dragFunction) throw new BallisticsError('INVALID_INPUT', 'Call setVariables first.');
    finite('Bore elevation (degrees)', angleDegrees, -45, 45);
    var maxRange = finite('Maximum range (yards)', options.maxRange ?? 2000, 0.001, 50000);
    var step = finite('Integration step (feet)', options.stepFeet ?? 1.5, 0.01, 10);
    var interval = finite('Sample interval (yards)', options.intervalYards ?? 1, 0.01, 50000) * 3;
    var maxSteps = finite('Step limit', options.maxSteps ?? 250000, 1, 300000);
    var maxTime = finite('Flight time limit (seconds)', options.maxTime ?? 60, 0.001, 120);
    var shootingAngle = this.degToRad(finite('Shooting angle (degrees)', options.shootingAngle ?? this.shootingAngle, -89, 89));
    var head = options.calm ? 0 : this.getHeadWind(this.windSpeed, this.windAngle) * (22 / 15);
    var cross = options.calm ? 0 : this.getCrossWind(this.windSpeed, this.windAngle);
    var gx = this.gravity * Math.sin(shootingAngle);
    var gy = this.gravity * Math.cos(shootingAngle);
    var self = this;
    function derivative(s) {
        var vx = s[2], vy = s[3], speed = Math.hypot(vx, vy);
        if (!(vx > 0.01) || !s.every(Number.isFinite)) {
            throw new BallisticsError('FORWARD_LIMIT', 'Trajectory no longer advances downrange.');
        }
        var relative = speed + head;
        if (!(relative > 0 && relative < 10000)) {
            throw new BallisticsError('MODEL_LIMIT', 'Relative airspeed left the supported drag-model range.');
        }
        var drag = self.retard(relative);
        var ax = gx - drag * vx / speed;
        var ay = gy - drag * vy / speed;
        return [vy / vx, 1 / vx, ax / vx, ay / vx];
    }
    function add(s, d, h) { return s.map(function (v, i) { return v + d[i] * h; }); }
    function point(x, s, d) {
        return { x: x, y: s[0], time: s[1], vx: s[2], vy: s[3], ax: d[2] * s[2], ay: d[3] * s[2] };
    }
    var x = 0;
    var s = [-this.sightHeight / 12, 0, this.muzzleVelocity * Math.cos(this.degToRad(angleDegrees)),
        this.muzzleVelocity * Math.sin(this.degToRad(angleDegrees))];
    var d = derivative(s);
    var points = [point(0, s, d)];
    var nextSample = interval, target = maxRange * 3;
    var reason = 'requested-range', steps = 0;
    for (; x < target - 1e-9; steps++) {
        if (steps >= maxSteps) { reason = 'step-limit'; break; }
        if (s[1] >= maxTime) { reason = 'time-limit'; break; }
        if (Math.abs(s[3]) > 3 * s[2]) { reason = 'forward-limit'; break; }
        var h = Math.min(step, target - x, nextSample - x);
        try {
            var k1 = derivative(s);
            var k2 = derivative(add(s, k1, h / 2));
            var k3 = derivative(add(s, k2, h / 2));
            var k4 = derivative(add(s, k3, h));
            var next = s.map(function (v, i) { return v + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6; });
            var nd = derivative(next);
            if (next[1] > maxTime) { reason = 'time-limit'; break; }
            s = next; d = nd; x += h;
        } catch (error) {
            if (error instanceof BallisticsError && (error.code === 'FORWARD_LIMIT' || error.code === 'MODEL_LIMIT')) {
                reason = error.code === 'MODEL_LIMIT' ? 'model-limit' : 'forward-limit';
                break;
            }
            throw error;
        }
        if (x >= nextSample - 1e-9 || x >= target - 1e-9) {
            points.push(point(x, s, d));
            nextSample += interval;
        }
    }
    if (x > points[points.length - 1].x + 1e-9) points.push(point(x, s, d));
    return { points: points, termination: reason, steps: steps, boreAngle: angleDegrees,
        maxRange: x / 3, muzzleVelocity: this.muzzleVelocity, crossWind: cross };
};

function hermite(a, b, da, db, h, u) {
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h * da
        + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h * db;
}

ExternalBallistics.sample = function (result, yardage) {
    finite('Distance (yards)', yardage, 0, 50000);
    if (!result || yardage > result.maxRange + 1e-8) return null;
    var points = result.points, x = Math.min(yardage * 3, points[points.length - 1].x);
    var lo = 0, hi = points.length - 1;
    while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (points[mid].x <= x) lo = mid; else hi = mid;
    }
    var a = points[lo], b = points[hi], h = b.x - a.x, u = h ? (x - a.x) / h : 0;
    var y = h ? hermite(a.y, b.y, a.vy / a.vx, b.vy / b.vx, h, u) : a.y;
    var time = h ? hermite(a.time, b.time, 1 / a.vx, 1 / b.vx, h, u) : a.time;
    var vx = h ? hermite(a.vx, b.vx, a.ax / a.vx, b.ax / b.vx, h, u) : a.vx;
    var vy = h ? hermite(a.vy, b.vy, a.ay / a.vx, b.ay / b.vx, h, u) : a.vy;
    var wind = result.crossWind * 17.6 * (time - x / result.muzzleVelocity);
    return { range: x / 3, path: y * 12, time: time, velocity: Math.hypot(vx, vy),
        velocityX: vx, velocityY: vy, windage: wind,
        moa: x === 0 ? null : -Math.atan(y / x) * 10800 / Math.PI,
        windageMOA: x === 0 ? null : Math.atan(wind / (12 * x)) * 10800 / Math.PI };
};

// The sight-in reference is level and calm, as in the original API. The shot
// itself uses shootingAngle and wind. Intercept is supplied in inches.
ExternalBallistics.prototype.getZeroAngle = function () {
    var self = this;
    var target = this.yIntercept / 12;
    function residual(angle) {
        var r = self.integrate(angle, { maxRange: self.zeroRange, intervalYards: self.zeroRange,
            calm: true, shootingAngle: 0 });
        if (r.termination !== 'requested-range') return null;
        return r.points[r.points.length - 1].y - target;
    }
    var low = -5, high = 0;
    var fLow = residual(low), fHigh = residual(high);
    if (fHigh !== null && Math.abs(fHigh) < 1e-7) return high;
    if (fLow !== null && fLow > 0) throw new BallisticsError('ZERO_UNREACHABLE', 'Zero lies outside the supported low-angle branch.');
    for (var i = 0; i < 12 && (fHigh === null || fHigh < 0); i++) {
        if (fHigh !== null) { low = high; fLow = fHigh; }
        high = high === 0 ? 0.05 : Math.min(45, high * 2);
        fHigh = residual(high);
        if (high === 45) break;
    }
    if (fLow === null || fHigh === null || fHigh < 0) {
        throw new BallisticsError('ZERO_UNREACHABLE', 'No reachable low-angle zero at this distance. Reduce the zero range.');
    }
    for (var j = 0; j < 60; j++) {
        var angle = (low + high) / 2, f = residual(angle);
        if (f === null) throw new BallisticsError('ZERO_UNREACHABLE', 'Zero range exceeds the supported trajectory.');
        if (Math.abs(f) < 1e-7) return angle;
        if (f > 0) high = angle; else low = angle;
    }
    throw new BallisticsError('ZERO_CONVERGENCE', 'Zero solver did not converge.');
};

ExternalBallistics.prototype.solveAll = function (options) {
    options = options || {};
    finite('Legacy record capacity', this.BCOMP_MAXRANGE, 2, 50001);
    var maxRange = options.maxRange ?? Math.min(2000, this.BCOMP_MAXRANGE - 1);
    if (maxRange > this.BCOMP_MAXRANGE - 1) throw new BallisticsError('INVALID_INPUT', 'Range exceeds the legacy record capacity.');
    var angle = this.getZeroAngle();
    var result = this.integrate(angle, options.maxRange === undefined ? Object.assign({}, options, { maxRange: maxRange }) : options);
    this.result = result;
    this.solution = [];
    var count = Math.floor(result.maxRange + 1e-8) + 1;
    for (var i = 0; i < count; i++) {
        var s = ExternalBallistics.sample(result, i);
        this.solution.push(s.range, s.path, s.moa, s.time, s.windage, s.windageMOA,
            s.velocity, s.velocityX, s.velocityY, 0);
    }
    this.maximumValidRange = count;
    return result;
};
ExternalBallistics.prototype.sampleAt = function (yardage) { return ExternalBallistics.sample(this.result, yardage); };
var getters = { getRange: 0, getPath: 1, getMinuteOfAngle: 2, getTime: 3, getWindage: 4,
    getWindageMOA: 5, getVelocity: 6, getVelocityX: 7, getVelocityY: 8 };
Object.keys(getters).forEach(function (name) {
    ExternalBallistics.prototype[name] = function (yardage) {
        if (!Number.isInteger(yardage) || yardage < 0) throw new BallisticsError('INVALID_INDEX', 'Legacy lookups require a nonnegative integer yard index. Use sampleAt for fractional distances.');
        return yardage < this.maximumValidRange ? this.solution[yardage * 10 + getters[name]] : null;
    };
});
return ExternalBallistics;
});
