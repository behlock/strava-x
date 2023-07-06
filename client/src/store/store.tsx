import { configureStore } from '@reduxjs/toolkit'
import thunk from 'redux-thunk'

import Reducer from './reducers/reducer'

export const initialState = {
}

const initStore = () =>
  configureStore({
    reducer: Reducer,
    preloadedState: initialState,
    middleware: [thunk],
  })

export default initStore
