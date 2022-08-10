import React from 'react';
import './App.css';
import { format, differenceInCalendarDays } from 'date-fns';
import { XAxis, YAxis, AreaChart, Area, TooltipProps } from 'recharts';

const UNIT_WIDTH = 2.5;
const PICKUP_DAYS_TO_SHOW = 200;

type PickupProps = {
  unitWidth: number;
  pickupDaysToShow: number;
  seedType: string;
  lockedDay: null | {
    day: number;
    pickup: { day: number; occ: number }[];
    coordinateX: number;
  };
};

const sumArray = (arr: number[]) => arr.reduce((acc, curr) => acc + curr, 0);

const PickUp: React.FC<PickupProps & TooltipProps<number, string>> = (props) => {
  const [showTrendLine, setShowTrendLine] = React.useState(false);
  // console.log('PROPS', props);
  const zeroDay = new Date('2022-07-21').getTime();
  const pickupDay = React.useMemo(
    () =>
      (props.lockedDay ? props.lockedDay.day : props.payload && props.payload[0]?.payload?.day) ||
      zeroDay,
    [props.lockedDay, props.payload, zeroDay]
  );
  const pickupData = React.useMemo(
    () =>
      (props.lockedDay
        ? props.lockedDay.pickup
        : props.payload && props.payload[0]?.payload?.pickup) || [],
    [props.lockedDay, props.payload]
  );
  const pickupLastDay = React.useMemo(() => pickupData[pickupData.length - 1]?.day, [pickupData]);
  const pickupFirstDay = React.useMemo(() => pickupData[0]?.day, [pickupData]);

  // const lastPickupDaysBeforeZeroDay = React.useMemo(
  //   () => differenceInCalendarDays(zeroDay, pickupLastDay),
  //   [pickupLastDay, zeroDay]
  // );
  const pickupDaysBeforeZeroDay = React.useMemo(
    () => differenceInCalendarDays(zeroDay, pickupDay),
    [pickupDay, zeroDay]
  );
  const pickupDaysAfterZeroDay = React.useMemo(
    () => differenceInCalendarDays(pickupDay, zeroDay),
    [pickupDay, zeroDay]
  );
  const firstPickupDaysBeforePickupDay = React.useMemo(
    () => differenceInCalendarDays(pickupDay, pickupFirstDay),
    [pickupDay, pickupFirstDay]
  );
  const lastPickupDaysBeforePickupDay = React.useMemo(
    () => differenceInCalendarDays(pickupLastDay, pickupDay),
    [pickupDay, pickupLastDay]
  );

  const zeroDayPercent = (100 * zeroDay) / (pickupLastDay || zeroDay);

  const seedLength = React.useMemo(() => {
    switch (props.seedType) {
      case 'all':
        return pickupData.length;
      case '200':
        return 200;
      case '100':
        return 100;
      case '50':
        return 50;
      case '10':
        return 10;
      case '3':
        return 3;
      default:
        return PICKUP_DAYS_TO_SHOW - pickupDaysAfterZeroDay;
    }
  }, [pickupData.length, pickupDaysAfterZeroDay, props.seedType]);

  const extendedData = React.useMemo(() => {
    const processedPickupData = [];
    if (pickupData.length > 0) {
      const recentPoints: any[] = [];
      const startPoint = pickupData.length - seedLength;
      pickupData.forEach((elem: any, i: number) => {
        if (i >= startPoint) {
          recentPoints.push(elem);
        }
      });
      const xs = recentPoints.map((_: any, i: number) => i);
      const ys = recentPoints.map(({ occ }: { occ: number }) => Math.log10(occ));

      const n = xs.length;
      const sumX = sumArray(xs);
      const sumY = sumArray(ys);
      const x2s = xs.map((x: number) => x * x);
      const sumX2 = sumArray(x2s);
      const xYs = xs.map((x: number, i: number) => x * ys[i]);
      const sumXY = sumArray(xYs);
      const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const b = (sumY - m * sumX) / n;
      const r = 10 ** m;
      const A = 10 ** b;
      const testTrend = [];
      for (let i = 0; i < recentPoints.length; i++) {
        testTrend.push(A * r ** i);
      }

      if (pickupDaysBeforeZeroDay >= 0) {
        // The day in question is in the past
        showTrendLine && setShowTrendLine(false);
        const padEnd = lastPickupDaysBeforePickupDay;
        if (firstPickupDaysBeforePickupDay < PICKUP_DAYS_TO_SHOW) {
          const padStart = PICKUP_DAYS_TO_SHOW - padEnd - pickupData.length;

          let i = 0,
            j = 0;
          while (i < padStart) {
            processedPickupData.push({
              day: i,
              occ: 0,
            });
            i++;
          }
          while (j < pickupData.length - 1) {
            processedPickupData.push({
              day: i,
              occ: pickupData[j].occ,
            });
            i++;
            j++;
          }
        } else {
          const skipStart = pickupData.length - (PICKUP_DAYS_TO_SHOW - padEnd);

          let i = skipStart,
            j = 0;
          while (i < pickupData.length) {
            processedPickupData.push({
              day: j,
              occ: pickupData[i].occ,
            });
            i++;
            j++;
          }
          while (i < pickupData.length + padEnd) {
            processedPickupData.push({
              day: j,
              occ: pickupData[pickupData.length - 1].occ,
            });
            i++;
            j++;
          }
        }
      } else {
        // The day in question is in the future
        // console.log('the day in question is in the future');
        !showTrendLine && setShowTrendLine(true);
        if (Math.abs(lastPickupDaysBeforePickupDay) > PICKUP_DAYS_TO_SHOW) {
          // console.log('all the shown pickup days are in the future');
          for (let i = 0; i < PICKUP_DAYS_TO_SHOW; i++) {
            processedPickupData.push({
              day: i,
              occ: pickupData[pickupData.length - 1].occ,
              trend: A * r ** i,
            });
          }
        } else {
          // console.log('some of the shown pickup days are in the future and some are in the past');
          if (firstPickupDaysBeforePickupDay > PICKUP_DAYS_TO_SHOW) {
            // console.log('the first pickup day is before the shown window');
            const skipStart =
              pickupData.length - (PICKUP_DAYS_TO_SHOW - Math.abs(lastPickupDaysBeforePickupDay));
            let i = 0,
              j = skipStart;
            const trendOffset = pickupData.length - seedLength - skipStart;

            while (j < pickupData.length) {
              processedPickupData.push({
                day: i,
                occ: pickupData[j].occ,
                trend: A * r ** (-trendOffset + i),
              });
              i++;
              j++;
            }

            for (i; i < PICKUP_DAYS_TO_SHOW; i++) {
              processedPickupData.push({
                day: i,
                occ: 0,
                trend: A * r ** (-trendOffset + i),
              });
            }
          }
        }
      }
    }

    return processedPickupData;
  }, [
    firstPickupDaysBeforePickupDay,
    lastPickupDaysBeforePickupDay,
    pickupData,
    pickupDaysBeforeZeroDay,
    seedLength,
    showTrendLine,
  ]);

  // console.log('PICKUP', { day: props?.payload[0]?.payload?.day, pickup });
  // console.log('EXTENDED DATA', extendedData);
  // console.log('picupData', pickupData[0]);
  // console.log('CLICK SELECTED', props.clickSelected);
  return (
    <div
      style={{
        position: 'absolute',
        left:
          8 +
          (props.lockedDay?.coordinateX || props.coordinate?.x || 0) -
          PICKUP_DAYS_TO_SHOW * UNIT_WIDTH,
        height: '400px',
        width: `${PICKUP_DAYS_TO_SHOW * UNIT_WIDTH}px`,
        background: 'rgba(255, 255, 255, 0.5)',
        border: 'solid 1px blue',
      }}>
      <div
        style={{
          position: 'absolute',
          backgroundColor: 'white',
          padding: '12px',
        }}>
        Pickup (actual and forecast)
      </div>
      <div
        style={{
          position: 'absolute',
          backgroundColor: 'white',
          borderRadius: '6px',
          padding: '12px',
          top: '36px',
        }}>
        <span style={{ color: '#a7a7a7' }}>{format(pickupDay, 'EEEE')}</span>
        <br />
        {format(pickupDay, 'do MMM')}
        <br />
        {extendedData.length && (
          <div style={{ marginTop: '6px' }}>{`${(
            extendedData[extendedData.length - 1].trend || extendedData[extendedData.length - 1].occ
          ).toFixed(2)}% (${
            extendedData[extendedData.length - 1].trend ? 'forecast' : 'actual'
          })`}</div>
        )}
      </div>

      <AreaChart width={PICKUP_DAYS_TO_SHOW * UNIT_WIDTH} height={400} data={extendedData}>
        <defs>
          <linearGradient id='gradient' x1='0' y1='0' x2='100%' y2='0'>
            <stop offset='0%' stopColor='blue' />
            <stop offset={`${zeroDayPercent}%`} stopColor='blue' />
            <stop offset={`${zeroDayPercent}%`} stopColor='yellow' />
            <stop offset='100%' stopColor='yellow' />
          </linearGradient>
        </defs>
        {showTrendLine && (
          <Area type='monotone' dataKey='trend' dot={false} fill='red' animationDuration={100} />
        )}
        <Area
          type='monotone'
          dataKey='occ'
          dot={false}
          fill='url(#gradient)'
          animationDuration={100}
        />

        <XAxis dataKey='day' tick={false} />
        <YAxis domain={[0, 120]} hide={true} allowDataOverflow={true} />
      </AreaChart>
    </div>
  );
};

export default PickUp;
