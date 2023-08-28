import React, { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ArrowDown, ArrowUpRight } from 'lucide-react'

// @ts-ignore
const FilePicker = ({ onFilesSelected }) => {
  const handleFileSelect = (event: any) => {
    const selectedFiles = event.target.files
    onFilesSelected(selectedFiles)
  }

  return (
    <div className="flex flex-row items-start justify-between space-x-20">
      <text className="flex-none">Pick folder containing your exported GPX files </text>
      <Collapsible className="flex flex-grow flex-col items-center justify-center align-middle">
        <CollapsibleTrigger>
          <div className="flex items-center justify-center align-middle">
            <text>[instructions]</text>
            <ArrowDown className="ml-2" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col items-center justify-center align-middle">
            <div className="flex flex-col items-center justify-center space-y-3 align-middle">
              <text className="text-center">
                1. Head over to your{' '}
                <a
                  className="text-blue-500"
                  href="https://www.strava.com/athlete/delete_your_account"
                  target="_blank"
                  rel="noreferrer"
                >
                  Strava Profile Settings
                </a>{' '}
                and <b>Request Your Archive</b>
              </text>
              <text className="text-center">
                2. Once available, unzip the downloaded file and select the <b>activities</b> folder containing your GPX
                files
              </text>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex w-fit flex-none cursor-pointer items-center justify-end">
        <Label htmlFor="gpx" className="mt-1 flex-none">
          <div className="flex items-center justify-center align-middle">
            <ArrowUpRight className="mr-2" />
            <text className="mr-2">Select Folder</text>
          </div>
        </Label>
        <Input
          className="hidden"
          id="gpx"
          type="file"
          multiple
          onChange={handleFileSelect}
          // @ts-ignore
          webkitdirectory="true"
          directory="true"
        />
      </div>
    </div>
  )
}

export default FilePicker
