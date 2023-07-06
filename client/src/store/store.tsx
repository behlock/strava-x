import { configureStore } from '@reduxjs/toolkit'
import thunk from 'redux-thunk'

import GeoJsonDataReducer from '@/store/reducers/geoJsonDataReducer'

export const initialState = {
  geoJsonData: {
    type: 'FeatureCollection',
    features: [],
  },
  isLoading: false,
}

const initStore = () =>
  configureStore({
    reducer: GeoJsonDataReducer,
    preloadedState: initialState,
    middleware: [thunk],
  })

export default initStore
