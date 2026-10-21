Vue.use(Vuetify);
Vue.use(VueCharts);

var externalBallistics = new ExternalBallistics();
var dragFunctions = Object.keys(externalBallistics.DRAG_FUNCTIONS);

var externalBallisticsVariables = {
    'dragFunctions': dragFunctions,
    'dragFunction': dragFunctions.indexOf('G1') > -1 ? 'G1' : dragFunctions[0],
    'drawRanges': [100, 200, 300, 400, 500, 600, 1000, 2000],
    'drawRange': 300,
    'bulletMass': 225,        // Bullet's mass in grains
    'dragCoefficient': 0.55,  // Bullet's Ballistic Coefficient, B.C.
    'muzzleVelocity': 3000,   // Bullet's muzzle velocity in feet per second
    'windSpeed': 13,          // Wind speed in Miles per Hour
    'windAngle': 90,          // Wind direction angle in degrees (0=headwind, 90=right to left, 180=tailwind, 270/-90=left to right),
    'sightHeight': 1.6,       // Height of the line of sight from the center of the barrel's bore in inches
    'shootingAngle': 0,       // Shooting angle in degrees (uphill / downhill)
    'zeroRange': 100,         // Zero range in yards
    'calculatedRanges': [],
    'calculatedVelocities': [],
    'calculatedWindDrifts': [],
    'ballisticsDatasets': [
        {
            label: "Trajectory",
            yAxisID: 'T',
            data: [],
            fill: false,
            borderColor: "rgba(75,192,192,1)",
            backgroundColor: "rgba(75,192,192,1)",
        },
        {
            label: "Kinetic Energy",
            yAxisID: 'E',
            data: [],
            fill: false,
        }
    ],
    'chartOptions': {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            yAxes: [
                {
                    id: 'T',
                    type: 'linear',
                    position: 'left',
                },
                {
                    id: 'E',
                    type: 'linear',
                    position: 'right',
                }
            ]
        },
        tooltips: {
            mode: 'x',
            callbacks: {
                title: function(tooltipItem, data) {
                    return tooltipItem[0].xLabel + ' yards';
                },
                label: function(tooltipItem, data) {
                    if (tooltipItem.datasetIndex === 0) {
                        return 'Trajectory: ' + tooltipItem.yLabel + ' in';
                    }
                    else {
                        return 'Kinetic Energy: ' + tooltipItem.yLabel + ' J';
                    }
                },
                footer: function(tooltipItem, data) {
                    return 'Wind Drift: ' +
                        externalBallisticsVariables.calculatedWindDrifts[tooltipItem[0].index] +
                        ' in';
                },
                afterFooter: function(tooltipItem, data) {
                    return 'Velocity: ' +
                        externalBallisticsVariables.calculatedVelocities[tooltipItem[0].index] +
                        ' fps';
                }
            }
        }
    }
};

var calculateExternalBallistics = function(value) {
    // Revised 2026-10-21: validate the complete snapshot; zero is a valid input
    // for sight height, wind and inclination. Never coerce empty text to zero.
    var status = document.getElementById('legacy-status');
    var variables = { dragFunction: externalBallisticsVariables.dragFunction };
    var numericFields = ['bulletMass', 'dragCoefficient', 'muzzleVelocity', 'sightHeight',
        'shootingAngle', 'windSpeed', 'windAngle', 'zeroRange', 'drawRange'];
    try {
        numericFields.forEach(function(key) {
            var raw = externalBallisticsVariables[key];
            variables[key] = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
            if (!Number.isFinite(variables[key])) throw new Error('Complete all numeric fields.');
        });
        if (variables.bulletMass <= 0) throw new Error('Projectile mass must be positive.');
        if (variables.drawRange < 1 || variables.drawRange > 2000) throw new Error('Draw range must be between 1 and 2000 yards.');
        externalBallistics.setVariables(variables);
        externalBallistics.solveAll({ maxRange: variables.drawRange });
        if (status) status.textContent = 'Results are current. The full workbench is available at the repository root.';
    } catch (error) {
        if (status) status.textContent = 'Results are stale: ' + error.message;
        return;
    }

    externalBallisticsVariables.calculatedRanges = [];
    externalBallisticsVariables.calculatedVelocities = [];
    externalBallisticsVariables.calculatedWindDrifts = [];
    externalBallisticsVariables.ballisticsDatasets[0].data = [];
    externalBallisticsVariables.ballisticsDatasets[1].data = [];

    for (var yardage = 0; yardage <= variables.drawRange; yardage += 10) {
        if (externalBallistics.getRange(yardage) === null) {
            if (status) status.textContent = 'Trajectory stopped at the model limit; later distances are unavailable.';
            break;
        }
        externalBallisticsVariables.calculatedRanges.push(
            externalBallistics.getRange(yardage).toFixed(0));

        var velocity = externalBallistics.getVelocity(yardage);
        externalBallisticsVariables.calculatedVelocities.push(
            velocity.toFixed(2));

        externalBallisticsVariables.calculatedWindDrifts.push(
            externalBallistics.getWindage(yardage).toFixed(2));

        externalBallisticsVariables.ballisticsDatasets[0].data.push(
            externalBallistics.getPath(yardage).toFixed(2));


       // Kinetic energy in Joules; to calculate in ft-lbf, use the following:
       // 0.5 * externalBallisticsVariables.bulletMass * (velocity * velocity) *
       // (1 / (7000 * -externalBallistics.DEFAULT_GRAVITY) )
       // - to convert ft-lbf to Joules, multiply the value with 1.35581795
       var kineticEnergy = 0.5 * variables.bulletMass * 0.00006479891 *
            Math.pow(velocity * 0.3048, 2);
       externalBallisticsVariables.ballisticsDatasets[1].data.push(
           kineticEnergy.toFixed(2));
    }
};

calculateExternalBallistics(1);

var ExampleApp = new Vue({
  el: '#external-ballistics-calculator',
  data: externalBallisticsVariables,
  filters: {
      floatformat: function (value, decimals) {
          decimals = parseInt(decimals);
          if (isNaN(decimals)) {
             decimals = 2;
          }
          return value.toFixed(decimals);
      }
  },
  methods: {
      calculate: calculateExternalBallistics,
      setDragFunctionAndCalculate: function(value) {
          externalBallisticsVariables.dragFunction = value;
          calculateExternalBallistics(1);
      },
      setRangeAndCalculate: function(value) {
          externalBallisticsVariables.drawRange = parseInt(value);
          calculateExternalBallistics(value);
      },
      calculateWithoutCheckingValue: function(value) {
          calculateExternalBallistics(1);
      }
  }
});
