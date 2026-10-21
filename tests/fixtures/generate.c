/* Fixture driver, 2026-10-21. GPL-2.0; see ../../LICENSE.
 * Original GNU Ballistics routines by Derek Yates are pinned in upstream/.
 * See README.md for revision, gravity adjustment and known inherited errors.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#define GRAVITY (-32.174)
#define __BCOMP_MAXRANGE__ 50001
enum { G1=1,G2,G3,G4,G5,G6,G7,G8 };
#include "upstream/_angle.c"
#include "upstream/_retard.c"
#include "upstream/_windage.c"
#include "upstream/_zero.c"
#include "upstream/_solve.c"

int main(void) {
    const int models[] = {G1,G2,G5,G6,G7,G8};
    const double speeds[] = {50,100,250,500,900,1100,1300,2000,3000,4500};
    printf("{\n  \"drag\": [\n");
    for (int m=0; m<6; m++) for (int v=0; v<10; v++) {
        printf("    {\"model\":\"G%d\",\"speed\":%.0f,\"bc\":0.465,\"retard\":%.15g}%s\n",
            models[m], speeds[v], retard(models[m],.465,speeds[v]), (m==5&&v==9)?"":",");
    }
    printf("  ],\n  \"trajectories\": [\n");
    for (int m=0; m<6; m++) {
        double* sln;
        double angle = ZeroAngle(models[m],.465,2650,1.6,200,0);
        SolveAll(models[m],.465,2650,1.6,0,angle,0,0,&sln);
        printf("    {\"model\":\"G%d\",\"angle\":%.15g,\"samples\":[",models[m],angle);
        for (int n=100; n<=500; n+=100) {
            printf("{\"range\":%.15g,\"path\":%.15g,\"time\":%.15g,\"speed\":%.15g}%s",
                sln[10*n],sln[10*n+1],sln[10*n+3],sln[10*n+6],n==500?"":",");
        }
        printf("]}%s\n",m==5?"":",");
        free(sln);
    }
    printf("  ]\n}\n");
    return 0;
}
