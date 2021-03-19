import React, { useState, useRef, useEffect } from 'react'

import mapboxgl from 'mapbox-gl'
import DatePicker from 'react-datepicker'

import { useRealmApp } from '../RealmApp'

import 'react-datepicker/dist/react-datepicker.css'

// eslint-disable-next-line no-undef
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN

export const Mapbox = () => {
  const mapContainerRef = useRef(null)
  const [map, setMap] = useState(null)
  const [selectedValues, setSelectedValues] = useState({ fetchDate: '', healthStatus: '' })
  const [dateRange, setDateRange] = useState({})
  const [hoveredFeature, _setHoveredFeature] = useState(null)
  const hoveredFeatureRef = useRef(hoveredFeature)
  const app = useRealmApp()

  const setHoveredFeature = (data) => {
    hoveredFeatureRef.current = data
    _setHoveredFeature(data)
  }

  // initialize map when component mounts
  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      // See style options here: https://docs.mapbox.com/api/maps/#styles
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [121.774, 12.8797],
      zoom: 5,
    })

    // add navigation control (the +/- zoom buttons)
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    map.once('load', async () => {
      setMap(map)

      const _dateRange = await app.getDateRange()
      const _initValues = { ...selectedValues, fetchDate: _dateRange.maxDate }

      setDateRange(_dateRange)
      setSelectedValues(_initValues)
      const caseCountLayer = await app.fetchData(_initValues)

      map.addSource('ph-covid19-source', {
        type: 'geojson',
        data: caseCountLayer,
      })

      map.addLayer({
        id: 'ph-covid19-layer',
        type: 'fill',
        source: 'ph-covid19-source',
        layout: {},
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'count'],
            0,
            ['to-color', '#ffffff'],
            10,
            ['to-color', '#fef0d9'],
            20,
            ['to-color', '#fdcc8a'],
            40,
            ['to-color', '#fc8d59'],
            100,
            ['to-color', '#e34a33'],
            200,
            ['to-color', '#b30000'],
          ],
          'fill-outline-color': '#000000',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.7],
        },
      })

      map.on('mousemove', 'ph-covid19-layer', (e) => {
        if (e.features.length > 0) {
          if (hoveredFeatureRef.current && hoveredFeatureRef.current > -1) {
            map.setFeatureState(
              { source: 'ph-covid19-source', id: hoveredFeatureRef.current },
              { hover: false }
            )
          }

          let _hoveredFeature = e.features[0].id

          map.setFeatureState({ source: 'ph-covid19-source', id: _hoveredFeature }, { hover: true })

          setHoveredFeature(_hoveredFeature)
        }
      })

      map.on('mouseleave', 'ph-covid19-layer', () => {
        if (hoveredFeatureRef.current) {
          map.setFeatureState(
            { source: 'ph-covid19-source', id: hoveredFeatureRef.current },
            { hover: false }
          )
        }
        setHoveredFeature(null)
      })
    })

    // clean up on unmount
    return () => map.remove()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadCaseCountLayer = async (newValues) => {
    setSelectedValues(newValues)
    const caseCountLayer = await app.fetchData(newValues)
    map.getSource('ph-covid19-source').setData(caseCountLayer)
  }

  return (
    <>
      <div className="absolute top-0 bottom-0 left-0 right-0" ref={mapContainerRef} />
      <div className="absolute top-0 left-0 p-3">
        <div className="bg-white p-5 rounded-lg shadow space-y-3">
          {dateRange.minDate && (
            <fieldset className="flex flex-col space-y-1">
              <label htmlFor="date-selector" className="font-medium">
                Date:
              </label>
              <DatePicker
                name="date-selector"
                className="ring-2 ring-teal-600 p-1 rounded rounded-md"
                popperClassName="bg-teal-300"
                selected={selectedValues.fetchDate}
                minDate={dateRange.minDate}
                maxDate={dateRange.maxDate}
                showYearDropdown
                showMonthDropdown
                onChange={(d) => reloadCaseCountLayer({ ...selectedValues, fetchDate: d })}
              />
            </fieldset>
          )}
          <fieldset className="flex flex-col space-y-1">
            <label htmlFor="health-status" className="font-medium">
              Health Status:
            </label>
            <select
              name="health-status"
              value={selectedValues.healthStatus}
              className="ring-2 ring-teal-600 p-1 rounded rounded-md"
              onChange={(e) =>
                reloadCaseCountLayer({ ...selectedValues, healthStatus: e.target.value })
              }
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="recovered">Recovered</option>
              <option value="asymptomatic">Asymptomatic</option>
              <option value="mild">Mild</option>
              <option value="severe">Severe</option>
              <option value="critical">Critical</option>
              <option value="died">Deaths</option>
            </select>
          </fieldset>
        </div>
      </div>
    </>
  )
}
