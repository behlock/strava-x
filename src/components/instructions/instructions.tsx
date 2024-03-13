import React from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// @ts-ignore
const Instructions = ({ onFilesSelected, isOpen, onOpenChange }) => {
  const handleFileSelect = (event: any) => {
    const selectedFiles = event.target.files
    onFilesSelected(selectedFiles)
  }

  return (
    <Collapsible className="flex flex-grow flex-col" open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger>
        <div className="flex">
          <span>[instructions]</span>
          {isOpen ? <ArrowDown className="ml-2" /> : <ArrowRight className="ml-2" />}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col ">
          <div className="flex flex-col space-y-1 ">
            <span>you can create your own map in two simple steps:</span>
            <span>
              1. head over to your{' '}
              <a
                className="text-blue-500"
                href="https://www.strava.com/athlete/delete_your_account"
                target="_blank"
                rel="noreferrer"
              >
                strava profile settings
              </a>{' '}
              and request your archive
            </span>
            <div className="flex flex-row space-x-1">
              <span>2. once available (typically within a few minutes), </span>
              <div className="flex w-fit flex-none cursor-pointer items-center justify-end">
                <Label htmlFor="gpx">
                  <div className="flex items-center justify-center align-middle">
                    <ArrowUpRight className="mr-1" />
                    <span className="text-base font-bold">choose the activities folder</span>
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
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default Instructions
