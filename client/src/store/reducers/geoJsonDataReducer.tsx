import { REQUEST_GEO_JSON_DATA, RESPONSE_GEO_JSON_DATA } from '@/store/actions'
import { initialState } from '../store'

const GeoJsonDataReducer = (state: any = initialState, action: any) => {
  switch (action.type) {
    case REQUEST_GEO_JSON_DATA:
      return {
        ...state,
        isLoading: true,
      }

    case RESPONSE_GEO_JSON_DATA:
      return {
        ...state,
        geoJsonData: action.data,
        isLoading: false,
      }

    default:
      return state
  }
}

export default GeoJsonDataReducer
