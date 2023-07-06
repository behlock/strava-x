import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import { AppDispatch, RootState } from '@/pages/_app'

export const REQUEST_GEO_JSON_DATA = 'REQUEST'
export const RESPONSE_GEO_JSON_DATA = 'RESPONSE'

export const fetcher = (url: string) => fetch(url).then((res) => res.json())

export const requestGeoJsonData = () => ({
  type: REQUEST_GEO_JSON_DATA,
})

export const responseGeoJsonData = (data: any) => ({
  type: RESPONSE_GEO_JSON_DATA,
  data,
})

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

export default {
  useAppDispatch,
  useAppSelector,
  requestGeoJsonData,
  responseGeoJsonData,
  fetcher,
}
