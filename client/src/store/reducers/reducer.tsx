import { REQUEST, RESPONSE } from '../actions'
import { initialState } from '../store'

const Reducer = (state: any = initialState, action: any) => {
  switch (action.type) {
    case REQUEST:
      return {
        ...state,
      }

    case RESPONSE:
      return {
        ...state,
      }

    default:
      return state
  }
}

export default Reducer
