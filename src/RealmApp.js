import React, { useState, useContext } from 'react'
import PropTypes from 'prop-types'
import { App, Credentials } from 'realm-web'

const RealmAppContext = React.createContext()

const EMPTY_GEOJSON = {
  type: 'FeatureCollection',
  features: [],
}

const activeStatEnum = ['asymptomatic', 'mild', 'moderate', 'severe', 'critical']

export const useRealmApp = () => {
  const app = useContext(RealmAppContext)
  if (!app) {
    throw new Error(`You must call useRealmApp() inside of a <RealmAppProvider />`)
  }
  return app
}

export const RealmAppProvider = ({ appId, children }) => {
  const [app, setApp] = useState(new App(appId))

  React.useEffect(() => {
    setApp(new App(appId))
  }, [appId])
  // Wrap the Realm.App object's user state with React state
  const [currentUser, setCurrentUser] = useState(app.currentUser)

  const logIn = async (credentials) => {
    await app.logIn(credentials)
    // If successful, app.currentUser is the user that just logged in
    setCurrentUser(app.currentUser)
  }

  const logOut = async () => {
    // Log out the currently active user
    await app.currentUser?.logOut()
    // If another user was logged in too, they're now the current user.
    // Otherwise, app.currentUser is null.
    setCurrentUser(app.currentUser)
  }

  const loginAnonymous = async () => {
    app.logIn(Credentials.anonymous())
    setCurrentUser(app.currentUser)
  }

  const loginApiKey = async (apiKey) => {
    // Create an API Key credential
    const credentials = Credentials.apiKey(apiKey)
    // Authenticate the user
    const user = await app.logIn(credentials)
    // `App.currentUser` updates to match the logged in user
    // assert(user.id === app.currentUser.id)
    return user
  }

  const fetchCountProv = async (healthStatus, prevData) => {
    const mongodb = currentUser.mongoClient('mongodb-atlas').db('default')
    const geomapsCol = mongodb.collection('geomaps')

    let newData =
      (await currentUser.functions.countCasesProv(healthStatus).catch((e) => console.log(e))) || []
    console.log(newData)

    if (prevData === undefined) {
      prevData =
        (await geomapsCol
          .findOne({ name: 'ph-prov' })
          .then((d) => d.geo)
          .catch((e) => console.log(e))) || []
    }

    if (prevData) {
      newData = prevData.features.map((f, idx) => {
        const matchData = newData.filter(({ _id }) => {
          if (_id !== null) {
            const [provResGeo, regionResGeo] = _id.split(',')
            return f.properties.region === regionResGeo && f.properties.province === provResGeo
          }
          return false
        })

        const { region, province } = f.properties

        if (matchData.length > 0) {
          let { count } = matchData[0]
          if (!Number.isInteger(count)) count = 0
          const newProp = { region, province, count }
          return { ...f, properties: newProp, id: idx }
        } else {
          const newProp = { region, province, count: 0 }
          return { ...f, properties: newProp, id: idx }
        }
      })

      newData = { ...prevData, features: newData }

      return newData
    }

    return EMPTY_GEOJSON
  }

  const fetchStats = async () => {
    const mongodb = currentUser.mongoClient('mongodb-atlas').db('default')
    const casesCol = mongodb.collection('cases')

    let totCase = await casesCol.aggregate([
      {
        $match: {
          deletedAt: {
            $exists: 0,
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$caseCode',
          healthStatus: { $first: '$healthStatus' },
          maxDate: { $max: '$dateRepConf' },
        },
      },
      { $group: { _id: '$healthStatus', count: { $sum: 1 }, maxDate: { $max: '$maxDate' } } },
      { $project: { healthStatus: '$_id', count: 1, maxDate: 1, _id: 0 } },
    ])
    const maxDate = totCase
      .map(({ maxDate }) => maxDate)
      .reduce((a, b) => {
        return a > b ? a : b
      }, 0)
    let _active = totCase
      .filter((c) => activeStatEnum.includes(c.healthStatus))
      .map((o) => o.count)
      .reduce((a, b) => a + b, 0)
    totCase = totCase.reduce((o, { healthStatus, count }) => {
      o[healthStatus] = count
      return o
    }, {})
    totCase['active'] = _active

    let newCase = await casesCol.aggregate([
      {
        $match: {
          deletedAt: {
            $exists: 0,
          },
          dateRepConf: maxDate,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$caseCode',
          healthStatus: { $first: '$healthStatus' },
        },
      },
      { $group: { _id: '$healthStatus', count: { $sum: 1 } } },
      { $project: { healthStatus: '$_id', count: 1, _id: 0 } },
    ])
    let _newActive = newCase
      .filter((c) => activeStatEnum.includes(c.healthStatus))
      .map((o) => o.count)
      .reduce((a, b) => a + b, 0)
    newCase = newCase.reduce((o, { healthStatus, count }) => {
      o[healthStatus] = count
      return o
    }, {})
    newCase['active'] = _newActive

    return { totCase, newCase, maxDate }
  }

  const wrapped = {
    ...app,
    currentUser,
    logIn,
    logOut,
    loginAnonymous,
    loginApiKey,
    fetchCountProv,
    fetchStats,
  }
  return <RealmAppContext.Provider value={wrapped}>{children}</RealmAppContext.Provider>
}

RealmAppProvider.propTypes = {
  appId: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}
