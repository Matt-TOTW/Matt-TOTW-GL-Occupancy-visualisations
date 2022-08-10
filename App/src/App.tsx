import React from 'react';
import { parse } from 'zipson';
import './App.css';
import { format, addDays, compareAsc } from 'date-fns';
import { CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { CategoricalChartState } from 'recharts/types/chart/generateCategoricalChart';

import JSZipUtils from 'jszip-utils';
import JSZip from 'jszip';
import { Booking, IncomingData, PickupItem, Sites } from './models/incoming';
import PickUp from './Pickup';

const UNIT_WIDTH = 2.5;
const PICKUP_DAYS_TO_SHOW = 200;

const App: React.FC = () => {
  const [incomingData, setIncomingData] = React.useState<IncomingData>();
  const [seedType, setSeedType] = React.useState('visible');
  const [selectedSites, setSelectedSites] = React.useState(['ALL']);
  // const [selectedRatePlans, setSelectedRatePlans] = React.useState(['ALL']);
  const [selectedDay, setSelectedDay] = React.useState<{ day: number; coordinateX: number } | null>(
    null
  );

  React.useEffect(() => {
    JSZipUtils.getBinaryContent(
      'http://localhost:3000/parsedCompressed.zip',
      function (err: any, data: any) {
        if (err) throw err;

        JSZip.loadAsync(data)
          .then(function (zip) {
            return zip.file('parsedZipson.txt')?.async('string');
          })
          .then(function (data) {
            setIncomingData(parse(data!));
          });
      }
    );
  }, []);

  const parsedData = React.useMemo(() => incomingData?.bookings, [incomingData?.bookings]);
  const sites = React.useMemo(() => incomingData?.sites, [incomingData?.sites]);
  // const ratePlans = React.useMemo(() => incomingData?.ratePlans, [incomingData?.ratePlans]);
  // const roomTypes = React.useMemo(() => incomingData?.roomTypes, [incomingData?.roomTypes]);

  const nextDayMap = React.useMemo(() => {
    // This nextDayMap object is for speed. The infill function below needs to get
    // the day after a given date very quickly, and doing it by creating and testing
    // dates on the fly is too slow.

    if (!parsedData) return {};

    let minDay = Date.now(),
      maxDay = 0;
    parsedData.forEach((dayItem) => {
      const firstPickupDay = dayItem.pickup[0].day;
      const lasyPickupDay = dayItem.pickup[dayItem.pickup.length - 1].day;
      if (firstPickupDay < minDay) minDay = firstPickupDay;
      if (lasyPickupDay > maxDay) maxDay = lasyPickupDay;
    });

    const map: { [day: string]: string } = {};
    const minDayStr = format(minDay, 'yyyy-MM-dd');
    let runningDayStr = minDayStr;
    while (true) {
      const thisDayStr = runningDayStr;
      const thisDayDate = new Date(thisDayStr);
      const nextDayDate = addDays(thisDayDate, 1);
      const nextDayStr = format(nextDayDate, 'yyyy-MM-dd');

      map[thisDayStr] = nextDayStr;

      runningDayStr = nextDayStr;
      if (compareAsc(thisDayDate, maxDay) > 0) break;
    }

    return map;
  }, [parsedData]);

  const killClickSelected = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedDay(null);
    }
  };

  React.useEffect(() => {
    document.addEventListener('keydown', killClickSelected, false);
    return () => document.removeEventListener('keydown', killClickSelected, false);
  }, []);

  const xTickFormatter = React.useCallback(
    (date: number | 'auto') =>
      date === 'auto' ? date : new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date),
    []
  );
  const firstsOfTheMonth = React.useMemo(
    () => Array.from(new Array(12)).map((_, month) => new Date(2022, month, 1).getTime()),
    []
  );

  const handleSetSeedType = (e: React.ChangeEvent<HTMLInputElement>) => setSeedType(e.target.value);

  const totalCapacityOfSelected = React.useMemo(() => {
    // TODO Currently assuming allRatePlans but will pass in list of selected ratePlans and sum those

    return selectedSites.reduce(
      (prevVal, currSite) =>
        sites && currSite !== 'ALL' ? prevVal + sites[currSite].allRatePlans.max : 0,
      0
    );
  }, [selectedSites, sites]);

  const infill = React.useCallback(
    (pickup: { day: number; dayStr: string; occ: number }[]) => {
      const infilled = [pickup[0]];
      let i = 1;
      while (true) {
        if (pickup.length < 2) break;
        const testDay2 = nextDayMap[infilled[infilled.length - 1].dayStr];
        if (testDay2 !== pickup[i].dayStr) {
          infilled.push({
            day: new Date(testDay2).getTime(),
            dayStr: testDay2,
            occ: infilled[infilled.length - 1].occ || 0,
          });
          continue;
        } else {
          infilled.push({
            day: pickup[i].day,
            dayStr: pickup[i].dayStr,
            occ: pickup[i].occ || infilled[infilled.length - 1].occ,
          });
        }

        if (i === pickup.length - 1) break;
        i++;
      }
      return infilled;
    },
    [nextDayMap]
  );

  const sumStayDateOccupanciesOfSelected = React.useCallback(
    (roomPick: Booking) => {
      // TODO Currently assuming allRatePlans but will pass in list of selected ratePlans and sum those

      const sumOccupiedRooms = selectedSites.reduce(
        (prevVal, currSite) =>
          sites && currSite !== 'ALL'
            ? prevVal +
              (roomPick[`site_${currSite}`].allRatePlans / 100) * sites[currSite].allRatePlans.max
            : 0,
        0
      );

      return (100 * sumOccupiedRooms) / totalCapacityOfSelected;
    },
    [selectedSites, sites, totalCapacityOfSelected]
  );

  const processPickupData = React.useCallback(
    (pickupData: PickupItem[]) => {
      const sitesWithBookings: Sites = {};
      return pickupData.map((pickupItem) => {
        // Add all the selected sites that have bookings on this pickup item (ie created day)
        // and store for later
        selectedSites.forEach((site) => {
          if (pickupItem[`site_${site}_total`]) {
            sitesWithBookings[`site_${site}`] = pickupItem[`site_${site}_total`];
          }
        });

        const occupiedRoomsSoFar = Object.entries(sitesWithBookings).reduce(
          (prevVal, [site, occs]) => {
            // TODO Currently assuming allRatePlans but will pass in list of selected ratePlans and sum those
            const currentOccupiedRooms = sites
              ? (occs.allRatePlans * sites[site.split('site_')[1]].allRatePlans.max) / 100
              : 0;
            return prevVal + currentOccupiedRooms;
          },
          0
        );

        return {
          day: pickupItem.day,
          dayStr: pickupItem.dayStr,
          occ: (100 * occupiedRoomsSoFar) / totalCapacityOfSelected,
        };
      });
    },
    [selectedSites, sites, totalCapacityOfSelected]
  );

  const filteredData = React.useMemo(() => {
    return (parsedData || []).map((roomPick, i) => {
      if (selectedSites.includes('ALL')) {
        return {
          day: roomPick.day,
          occ: roomPick.occTotal,
          pickup: infill(
            roomPick.pickup.map(({ day, dayStr, occTotal: occ }) => ({ day, dayStr, occ }))
          ),
        };
      }

      const summedOcc = sumStayDateOccupanciesOfSelected(roomPick);
      const pickup = processPickupData(roomPick.pickup);

      return {
        day: roomPick.day,
        occ: summedOcc,
        pickup: infill(pickup),
      };
    });
  }, [infill, parsedData, processPickupData, selectedSites, sumStayDateOccupanciesOfSelected]);

  const handleClickSelect = (e: CategoricalChartState) => {
    setSelectedDay({ day: e.activePayload![0].payload.day, coordinateX: e.activeCoordinate!.x });
  };

  const lockedDay = React.useMemo(() => {
    if (!selectedDay) return null;

    const stayDateData = filteredData.find(({ day }) => day === selectedDay.day);
    return {
      day: stayDateData?.day || 0,
      pickup: stayDateData?.pickup || [],
      coordinateX: selectedDay.coordinateX,
    };
  }, [filteredData, selectedDay]);

  const sitesSelect = React.useCallback(() => {
    const handleSelectSite = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedSites((prev) => {
        if (e.target.value === 'ALL') {
          if (e.target.checked) {
            return ['ALL'];
          } else {
            return [];
          }
        } else {
          const removedAll = prev.filter((elem) => elem !== 'ALL');
          if (removedAll.includes(e.target.value)) {
            return removedAll.filter((elem) => elem !== e.target.value);
          }
          return [...removedAll, e.target.value];
        }
      });
    };

    return ['ALL', ...Object.keys(sites || {})].map((site, i) => {
      return (
        <label key={i}>
          <input
            onChange={handleSelectSite}
            type='checkbox'
            value={site}
            checked={selectedSites.includes(site)}
            name='selectedSite'
          />
          {site}
        </label>
      );
    });
  }, [selectedSites, sites]);

  // const ratePlansSelect = React.useCallback(() => {
  //   const handleSelectRatePlan = (e: React.ChangeEvent<HTMLInputElement>) => {
  //     setSelectedRatePlans((prev) => {
  //       if (e.target.value === 'ALL') {
  //         if (e.target.checked) {
  //           return ['ALL'];
  //         } else {
  //           return [];
  //         }
  //       } else {
  //         const removedAll = prev.filter((elem) => elem !== 'ALL');
  //         if (removedAll.includes(e.target.value)) {
  //           return removedAll.filter((elem) => elem !== e.target.value);
  //         }
  //         return [...removedAll, e.target.value];
  //       }
  //     });
  //   };

  //   return ['ALL', ...Object.keys(ratePlans || {})].map((ratePlan, i) => {
  //     return (
  //       <label key={i}>
  //         <input
  //           onChange={handleSelectRatePlan}
  //           type='checkbox'
  //           value={ratePlan}
  //           checked={selectedRatePlans.includes(ratePlan)}
  //           name='selectedSite'
  //         />
  //         {ratePlan}
  //       </label>
  //     );
  //   });
  // }, [ratePlans, selectedRatePlans]);

  if (!parsedData)
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <p style={{ letterSpacing: '10px' }}>Loading...</p>
      </div>
    );

  return (
    <div
      style={{
        width: `${parsedData.length * UNIT_WIDTH}px`,
        marginLeft: `${PICKUP_DAYS_TO_SHOW * UNIT_WIDTH}px`,
        marginTop: '50px',
      }}>
      <h3>POA occupancy for 2022 (actual and booked)</h3>
      <div
        style={{
          display: 'flex',
        }}>
        <form
          style={{
            display: 'flex',
            flexDirection: 'column',
            margin: '0 0 24px',
          }}>
          <p>Calculate trendline based on...</p>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='all'
              checked={seedType === 'all'}
              name='seedType'
            />
            All data points
          </label>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='visible'
              checked={seedType === 'visible'}
              name='seedType'
            />
            Data points that are visible in the window
          </label>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='200'
              checked={seedType === '200'}
              name='seedType'
            />
            The last 200 data points
          </label>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='100'
              checked={seedType === '100'}
              name='seedType'
            />
            The last 100 data points
          </label>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='50'
              checked={seedType === '50'}
              name='seedType'
            />
            The last 50 data points
          </label>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='10'
              checked={seedType === '10'}
              name='seedType'
            />
            The last 10 data points
          </label>
          <label>
            <input
              onChange={handleSetSeedType}
              type='radio'
              value='3'
              checked={seedType === '3'}
              name='seedType'
            />
            The last 3 data points
          </label>
        </form>
        <form
          style={{
            display: 'flex',
            flexDirection: 'column',
            margin: '0 56px 24px',
            height: '245px',
            overflowY: 'scroll',
            scrollBehavior: 'smooth',
          }}>
          <p>Select site...</p>
          {sitesSelect()}
        </form>
        {/* <form
        style={{
          display: 'flex',
          flexDirection: 'column',
          margin: '0 0 24px',
        }}>
        <p>Select rate plan...</p>
        {ratePlansSelect()}
      </form> */}
      </div>
      <p>
        {lockedDay ? (
          <span style={{ color: 'red' }}>LOCKED. Press ESC to unlock.</span>
        ) : (
          'Click chart to lock pickup window'
        )}
      </p>
      <BarChart
        width={parsedData.length * UNIT_WIDTH}
        height={400}
        data={filteredData}
        onClick={handleClickSelect}>
        <Bar type='monotone' dataKey='occ' stroke='#8884d8' />
        <CartesianGrid stroke='#ccc' horizontalPoints={[65]} verticalPoints={[528]} />
        <Tooltip
          content={
            <PickUp
              seedType={seedType}
              unitWidth={UNIT_WIDTH}
              pickupDaysToShow={PICKUP_DAYS_TO_SHOW}
              lockedDay={lockedDay}
            />
          }
          position={{ x: 0, y: 0 }}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={lockedDay ? { visibility: 'visible' } : {}}
        />
        <XAxis
          dataKey='day'
          type='number'
          domain={['dataMin', 'dataMax']}
          ticks={firstsOfTheMonth}
          tickFormatter={xTickFormatter}
          tick={<CustomTick />}
        />
        <YAxis domain={[0, 120]} />
      </BarChart>
    </div>
  );
};

export default App;

const CustomTick = ({ x, y, payload }: any) => (
  <g transform={`translate(${x},${y})`}>
    <text x={6} y={0} dy={16} textAnchor='start' fill='#666'>
      {new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(payload.value)}
    </text>
  </g>
);
